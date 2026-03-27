import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse";
import { Coordinate, ShapePoint, ShapeSegmentResult } from "../types/index.js";
import { distanceMeters } from "../utils/geo";

interface BoundedCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  has(key: K): boolean;
  delete(key: K): void;
  clear(): void;
}

function createBoundedCache<K, V>(maxSize: number): BoundedCache<K, V> {
  const cache = new Map<K, V>();
  return {
    get: (key) => cache.get(key),
    set: (key, value) => {
      if (cache.size >= maxSize && !cache.has(key)) {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) cache.delete(firstKey);
      }
      cache.set(key, value);
    },
    has: (key) => cache.has(key),
    delete: (key) => cache.delete(key),
    clear: () => cache.clear(),
  };
}

interface TripRow {
  trip_id: string;
  route_id: string;
  service_id: string;
  shape_id?: string;
}

interface ShapeRow {
  shape_id: string;
  shape_pt_lat: string;
  shape_pt_lon: string;
  shape_pt_sequence: string;
  shape_dist_traveled?: string;
}

interface StopTimeRow {
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: string;
}

interface StopRow {
  stop_id: string;
  stop_name: string;
  stop_lat: string;
  stop_lon: string;
  location_type?: string;
}

interface StopTime {
  stop_id: string;
  arrival_time: string;
  departure_time: string;
  stop_sequence: number;
}

const tripIndex = new Map<string, TripRow[]>();
const stopTimesIndex = new Map<string, StopTime[]>();
const stopNameToId = new Map<string, string>();
const stopIdToCoordinate = new Map<string, { lat: number; lng: number }>();
const stopIdToName = new Map<string, string>();

export { stopIdToCoordinate, stopNameToId };

const stopIdToTrips = new Map<string, string[]>();

export { stopIdToTrips };

const shapeIdToPoints = new Map<string, ShapePoint[]>();
const tripToShapeId = new Map<string, string>();
const shapeSegmentCache = createBoundedCache<string, ShapeSegmentResult>(500);

export { shapeIdToPoints, tripToShapeId };

interface TransferStation {
  stopId: string;
  name: string;
  lat: number;
  lng: number;
}

interface TransferJourney {
  fromStation: string;
  toStation: string;
  viaStation?: string;
  legs: DirectTrip[];
  totalDurationMinutes: number;
}

const TRANSFER_DISTANCE_METERS = 500;
const transferGraph = new Map<string, TransferStation[]>();
const transferCache = new Map<string, TransferJourney | null>();

export { transferGraph };

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bstation\b/g, "")
    .replace(/\brailway\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTransportType(feedDir: string): "train" | "tram" | "bus" {
  const folderNum = feedDir.replace(/\D/g, "");
  if (["1", "2", "10"].includes(folderNum)) return "train";
  if (["3"].includes(folderNum)) return "tram";
  return "bus";
}


function buildTransferGraph(): void {
  transferGraph.clear();
  const stations: TransferStation[] = [];

  for (const [id, coord] of stopIdToCoordinate) {
    stations.push({
      stopId: id,
      name: stopIdToName.get(id) || id,
      lat: coord.lat,
      lng: coord.lng,
    });
  }

  console.log(`[Transfer Graph] Building for ${stations.length} stations...`);

  for (const station of stations) {
    const nearby: TransferStation[] = [];
    for (const other of stations) {
      if (station.stopId !== other.stopId) {
        const dist = distanceMeters(
          { lat: station.lat, lng: station.lng },
          { lat: other.lat, lng: other.lng }
        );
        if (dist <= TRANSFER_DISTANCE_METERS) {
          nearby.push(other);
        }
      }
    }
    if (nearby.length > 0) {
      transferGraph.set(station.stopId, nearby);
    }
  }

  console.log(`[Transfer Graph] Built. ${transferGraph.size} stations have transfers.`);
}

function getTransferStations(stopId: string): TransferStation[] {
  return transferGraph.get(stopId) || [];
}

function findTransferJourney(
  fromStopId: string,
  toStopId: string,
  fromName: string,
  toName: string
): TransferJourney | null {
  const fromTransfers = getTransferStations(fromStopId);

  for (const transfer of fromTransfers) {
    const leg1 = findDirectTrip(fromStopId, transfer.stopId, fromName, transfer.name);
    if (!leg1) continue;

    const leg2 = findDirectTrip(transfer.stopId, toStopId, transfer.name, toName);
    if (!leg2) continue;

    const totalMins = Math.round(leg1.durationMins + leg2.durationMins + 3);
    return {
      fromStation: fromName,
      toStation: toName,
      viaStation: transfer.name,
      legs: [leg1.trip, leg2.trip],
      totalDurationMinutes: totalMins,
    };
  }

  return null;
}

function findDirectTrip(
  fromStopId: string,
  toStopId: string,
  fromName: string,
  toName: string
): { trip: DirectTrip; durationMins: number } | null {
  const tripsFromStation = stopIdToTrips.get(fromStopId);
  if (!tripsFromStation) return null;

  for (const tripId of tripsFromStation) {
    const stopTimes = stopTimesIndex.get(tripId);
    if (!stopTimes) continue;

    const sortedTimes = [...stopTimes].sort((a, b) => a.stop_sequence - b.stop_sequence);
    const fromIndex = sortedTimes.findIndex(s => s.stop_id === fromStopId);
    const toIndex = sortedTimes.findIndex(s => s.stop_id === toStopId);

    if (fromIndex !== -1 && toIndex !== -1 && fromIndex < toIndex) {
      const fromTime = sortedTimes[fromIndex];
      const toTime = sortedTimes[toIndex];

      const sequence: StopTimeEntry[] = [];
      for (let i = fromIndex; i <= toIndex; i++) {
        const st = sortedTimes[i];
        const stopName = stopIdToName.get(st.stop_id) || st.stop_id;
        sequence.push({
          stopId: st.stop_id,
          stopName,
          arrivalTime: st.arrival_time,
          departureTime: st.departure_time,
        });
      }

      const [fromH, fromM] = fromTime.departure_time.split(":").map(Number);
      const [toH, toM] = toTime.arrival_time.split(":").map(Number);
      const durationMins = (toH - fromH) * 60 + (toM - fromM);

      return {
        trip: {
          kind: "direct",
          tripId,
          fromStopId,
          toStopId,
          departureTime: fromTime.departure_time,
          arrivalTime: toTime.arrival_time,
          stopSequence: sequence,
        },
        durationMins: Math.max(1, durationMins),
      };
    }
  }

  return null;
}

export { findTransferJourney };

function stripBomBuffer(buffer: Buffer): Buffer {
  if (buffer.length > 0 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.subarray(3);
  }
  return buffer;
}

function createParser(buffer: Buffer) {
  return parse(stripBomBuffer(buffer), {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
  });
}

export async function loadGtfsTimetables(): Promise<void> {
  const gtfsRoot = process.env.GTFS_ROOT || "../gtfs";
  const absoluteRoot = path.resolve(process.cwd(), gtfsRoot);

  if (!fs.existsSync(absoluteRoot)) {
    console.warn("GTFS root not found, skipping timetable load.");
    return;
  }

  tripIndex.clear();
  stopTimesIndex.clear();
  stopNameToId.clear();
  stopIdToCoordinate.clear();
  stopIdToName.clear();
  stopIdToTrips.clear();
  tripToShapeId.clear();

  const feedDirs = fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  console.log("Loading GTFS Timetables...");

  for (const feedDir of feedDirs) {
    const type = getTransportType(feedDir);

    if (type !== "train") {
      console.log(`[GTFS] Skipping ${feedDir} (${type}) - not needed for initial routing`);
      continue;
    }

    const zipPath = path.join(absoluteRoot, feedDir, "google_transit.zip");
    if (!fs.existsSync(zipPath)) continue;

    try {
      const zip = new AdmZip(zipPath);
      console.log(`[GTFS] Loading ${feedDir} (${type})...`);

      const tripsEntry = zip.getEntry("trips.txt");
      if (tripsEntry) {
        const parser = createParser(tripsEntry.getData());
        for await (const row of parser) {
          const tripRow = row as TripRow;
          const existing = tripIndex.get(tripRow.service_id) || [];
          existing.push(tripRow);
          tripIndex.set(tripRow.service_id, existing);
          if (tripRow.shape_id) {
            tripToShapeId.set(tripRow.trip_id, tripRow.shape_id);
          }
        }
      }

      const stopTimesEntry = zip.getEntry("stop_times.txt");
      if (stopTimesEntry) {
        const parser = createParser(stopTimesEntry.getData());
        let rowCount = 0;
        for await (const row of parser) {
          const stRow = row as StopTimeRow;
          const tripId = stRow.trip_id;
          
          if (!stopTimesIndex.has(tripId)) {
            stopTimesIndex.set(tripId, []);
          }
          
          stopTimesIndex.get(tripId)?.push({
            stop_id: stRow.stop_id,
            arrival_time: stRow.arrival_time,
            departure_time: stRow.departure_time,
            stop_sequence: parseInt(stRow.stop_sequence, 10),
          });
          
          if (!stopIdToTrips.has(stRow.stop_id)) {
            stopIdToTrips.set(stRow.stop_id, []);
          }
          stopIdToTrips.get(stRow.stop_id)!.push(tripId);
          
          rowCount++;
        }
        console.log(`[GTFS] ${feedDir} (${type}): ${rowCount} stop_times loaded`);
      }

      const stopsEntry = zip.getEntry("stops.txt");
      if (stopsEntry) {
        const parser = createParser(stopsEntry.getData());
        for await (const row of parser) {
          const stopRow = row as StopRow;
          const normalized = normalizeName(stopRow.stop_name);
          const isParentStation = stopRow.location_type === "1";
          
          stopIdToCoordinate.set(stopRow.stop_id, {
            lat: parseFloat(stopRow.stop_lat),
            lng: parseFloat(stopRow.stop_lon),
          });
          stopIdToName.set(stopRow.stop_id, stopRow.stop_name);

          const isInStopTimes = stopIdToTrips.has(stopRow.stop_id);
          
          if (!stopNameToId.has(normalized)) {
            if (isInStopTimes || isParentStation) {
              stopNameToId.set(normalized, stopRow.stop_id);
              if (isParentStation && !isInStopTimes) {
                console.log(`[GTFS Stops] "${stopRow.stop_name}" -> parent station: ${stopRow.stop_id}`);
              }
            }
          } else if (isParentStation && isInStopTimes) {
            const existingId = stopNameToId.get(normalized)!;
            const existingInStopTimes = stopIdToTrips.has(existingId);
            if (!existingInStopTimes) {
              stopNameToId.set(normalized, stopRow.stop_id);
              console.log(`[GTFS Stops] "${stopRow.stop_name}" upgraded: ${existingId} -> ${stopRow.stop_id}`);
            }
          }
        }
      }

      console.log(`Loaded ${type} data from ${feedDir}`);
    } catch (err) {
      console.error(`Failed to load ${feedDir}:`, err);
    }
  }

  console.log(`[GTFS Timetables] Loaded: ${tripIndex.size} trips, ${stopTimesIndex.size} stop_times entries, ${stopNameToId.size} stops`);

  buildTransferGraph();
}

export function getNextDepartureTime(stationName: string): { time: string; waitMinutes: number } | null {
  const normalized = normalizeName(stationName);
  const stopId = stopNameToId.get(normalized);
  if (!stopId) return null;

  const now = new Date();
  const currentTime = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  for (const [, trips] of tripIndex) {
    for (const trip of trips) {
      const times = stopTimesIndex.get(trip.trip_id);
      if (!times) continue;

      const stationTimes = times
        .filter((t) => t.stop_id === stopId)
        .sort((a, b) => a.stop_sequence - b.stop_sequence);

      for (const st of stationTimes) {
        const [hours, minutes, seconds] = st.departure_time.split(":").map(Number);
        const departureSeconds = hours * 3600 + minutes * 60 + seconds;

        if (departureSeconds > currentTime) {
          const waitSeconds = departureSeconds - currentTime;
          return {
            time: st.departure_time,
            waitMinutes: Math.ceil(waitSeconds / 60),
          };
        }
      }
    }
  }

  return null;
}

export function findDeparturesForWaypoints(
  waypoints: { name?: string; position: { lat: number; lng: number } }[]
): { stationName: string; nextDeparture: string; waitTimeMinutes: number }[] {
  const results: { stationName: string; nextDeparture: string; waitTimeMinutes: number }[] = [];

  for (const wp of waypoints) {
    if (wp.name) {
      const departure = getNextDepartureTime(wp.name);
      if (departure) {
        results.push({
          stationName: wp.name,
          nextDeparture: departure.time,
          waitTimeMinutes: departure.waitMinutes,
        });
      }
    }
  }

  return results;
}

export interface StopTimeEntry {
  stopId: string;
  stopName: string;
  arrivalTime: string;
  departureTime: string;
}

export interface DirectTrip {
  kind: "direct";
  tripId: string;
  fromStopId: string;
  toStopId: string;
  departureTime: string;
  arrivalTime: string;
  stopSequence: StopTimeEntry[];
}

export interface MultiLegTrip {
  kind: "multi-leg";
  viaStation?: string;
  legs: DirectTrip[];
  totalDurationMinutes: number;
  departureTime: string;
  arrivalTime: string;
  tripId: string;
  fromStopId: string;
  toStopId: string;
  stopSequence: StopTimeEntry[];
}

export type TripResult = DirectTrip | MultiLegTrip;

function getStopNameById(stopId: string): string | undefined {
  return stopIdToName.get(stopId);
}

export function getTripBetweenStations(
  fromStationName: string,
  toStationName: string
): TripResult | null {
  const fromNormalized = normalizeName(fromStationName);
  const toNormalized = normalizeName(toStationName);

  const fromStopId = stopNameToId.get(fromNormalized);
  const toStopId = stopNameToId.get(toNormalized);

  console.log(`[PTV Route] Looking for trip: "${fromStationName}" -> "${toStationName}"`);
  console.log(`[PTV Route] Normalized: "${fromNormalized}" -> "${toNormalized}"`);
  console.log(`[PTV Route] Stop IDs: "${fromStopId}" -> "${toStopId}"`);

  if (!fromStopId || !toStopId) {
    console.log(`[PTV Route] FAIL: Could not find stop IDs for stations`);
    return null;
  }

  const tripsFromStation = stopIdToTrips.get(fromStopId) || [];
  console.log(`[PTV Route] Trips passing fromStopId: ${tripsFromStation.length}`);

  for (const tripId of tripsFromStation) {
    const stopTimes = stopTimesIndex.get(tripId);
    if (!stopTimes) continue;

    const sortedTimes = [...stopTimes].sort((a, b) => a.stop_sequence - b.stop_sequence);

    const fromIndex = sortedTimes.findIndex(s => s.stop_id === fromStopId);
    const toIndex = sortedTimes.findIndex(s => s.stop_id === toStopId);

    if (fromIndex !== -1 && toIndex !== -1 && fromIndex < toIndex) {
      const fromTime = sortedTimes[fromIndex];
      const toTime = sortedTimes[toIndex];

      const sequence: StopTimeEntry[] = [];
      for (let i = fromIndex; i <= toIndex; i++) {
        const st = sortedTimes[i];
        const stopName = getStopNameById(st.stop_id);
        sequence.push({
          stopId: st.stop_id,
          stopName: stopName || st.stop_id,
          arrivalTime: st.arrival_time,
          departureTime: st.departure_time,
        });
      }

      const fromH = parseInt(fromTime.departure_time.split(':')[0]);
      const fromM = parseInt(fromTime.departure_time.split(':')[1]);
      const toH = parseInt(toTime.arrival_time.split(':')[0]);
      const toM = parseInt(toTime.arrival_time.split(':')[1]);
      const durationMins = (toH - fromH) * 60 + (toM - fromM);

      console.log(`[PTV Route] SUCCESS: Found trip ${tripId}, ${sequence.length} stops, ~${durationMins} mins`);

      return {
        kind: "direct",
        tripId,
        fromStopId,
        toStopId,
        departureTime: fromTime.departure_time,
        arrivalTime: toTime.arrival_time,
        stopSequence: sequence,
      };
    }
  }

  console.log(`[PTV Route] FAIL: No trip found connecting both stations`);
  console.log(`[PTV Route] Trying transfer journey...`);
  const transferJourney = findTransferJourney(fromStopId, toStopId, fromStationName, toStationName);

  if (transferJourney) {
    console.log(`[PTV Route] TRANSFER SUCCESS: via "${transferJourney.viaStation}", ${transferJourney.legs.length} legs, ~${transferJourney.totalDurationMinutes} mins`);

    const allStops: StopTimeEntry[] = [];
    for (const leg of transferJourney.legs) {
      allStops.push(...leg.stopSequence);
    }

    return {
      kind: "multi-leg",
      viaStation: transferJourney.viaStation,
      legs: transferJourney.legs,
      totalDurationMinutes: transferJourney.totalDurationMinutes,
      departureTime: transferJourney.legs[0]?.departureTime || "00:00:00",
      arrivalTime: transferJourney.legs[transferJourney.legs.length - 1]?.arrivalTime || "00:00:00",
      tripId: transferJourney.legs.map(l => l.tripId).join('+'),
      fromStopId,
      toStopId,
      stopSequence: allStops,
    };
  }

  console.log(`[PTV Route] FAIL: No transfer journey found`);
  return null;
}

function timeToSeconds(time: string): number {
  const [hours, minutes, seconds] = time.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function parseGtfsTime(time: string): number {
  if (!time || time.length < 5) return 0;
  const [h, m, s] = time.split(":").map(Number);
  return (isNaN(h) ? 0 : h) * 3600 + (isNaN(m) ? 0 : m) * 60 + (isNaN(s) ? 0 : s);
}

export async function loadGtfsShapes(): Promise<void> {
  const gtfsRoot = process.env.GTFS_ROOT || "../gtfs";
  const absoluteRoot = path.resolve(process.cwd(), gtfsRoot);

  if (!fs.existsSync(absoluteRoot)) {
    console.warn("GTFS root not found, skipping shapes load.");
    return;
  }

  shapeIdToPoints.clear();
  shapeSegmentCache.clear();

  const feedDirs = fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  console.log("Loading GTFS Shapes...");

  let totalShapes = 0;
  let totalPoints = 0;

  for (const feedDir of feedDirs) {
    const zipPath = path.join(absoluteRoot, feedDir, "google_transit.zip");
    if (!fs.existsSync(zipPath)) continue;

    try {
      const zip = new AdmZip(zipPath);
      const shapesEntry = zip.getEntry("shapes.txt");

      if (shapesEntry) {
        const parser = createParser(shapesEntry.getData());
        let pointCount = 0;
        for await (const row of parser) {
          const shapeRow = row as ShapeRow;
          const shapeId = shapeRow.shape_id;

          if (!shapeIdToPoints.has(shapeId)) {
            shapeIdToPoints.set(shapeId, []);
            totalShapes++;
          }

          shapeIdToPoints.get(shapeId)!.push({
            lat: parseFloat(shapeRow.shape_pt_lat),
            lng: parseFloat(shapeRow.shape_pt_lon),
            sequence: parseInt(shapeRow.shape_pt_sequence, 10),
            distance: shapeRow.shape_dist_traveled
              ? parseFloat(shapeRow.shape_dist_traveled)
              : undefined,
          });
          pointCount++;
        }

        for (const [, points] of shapeIdToPoints) {
          points.sort((a, b) => a.sequence - b.sequence);
        }

        totalPoints += pointCount;
        console.log(`[GTFS Shapes] ${feedDir}: ${pointCount} points for ${totalShapes} shapes`);
      }
    } catch (err) {
      console.error(`Failed to load shapes from ${feedDir}:`, err);
    }
  }

  console.log(`[GTFS Shapes] Loaded ${totalShapes} shapes with ${totalPoints} total points`);
}

export function getShapeSegment(
  tripId: string,
  fromStopId: string,
  toStopId: string
): ShapeSegmentResult | null {
  const cacheKey = `${tripId}|${fromStopId}|${toStopId}`;
  if (shapeSegmentCache.has(cacheKey)) {
    return shapeSegmentCache.get(cacheKey)!;
  }

  const shapeId = tripToShapeId.get(tripId);
  if (!shapeId) {
    console.log(`[Shape Segment] No shape_id for trip ${tripId}`);
    return null;
  }

  const shapePoints = shapeIdToPoints.get(shapeId);
  if (!shapePoints || shapePoints.length === 0) {
    console.log(`[Shape Segment] No points found for shape ${shapeId}`);
    return null;
  }

  const stopTimes = stopTimesIndex.get(tripId);
  if (!stopTimes) {
    console.log(`[Shape Segment] No stop_times for trip ${tripId}`);
    return null;
  }

  const fromStop = stopTimes.find((s) => s.stop_id === fromStopId);
  const toStop = stopTimes.find((s) => s.stop_id === toStopId);

  if (!fromStop || !toStop) {
    console.log(`[Shape Segment] Stop IDs not found in trip ${tripId}`);
    return null;
  }

  const fromSeq = fromStop.stop_sequence;
  const toSeq = toStop.stop_sequence;

  if (fromSeq >= toSeq) {
    console.log(`[Shape Segment] Invalid sequence range: ${fromSeq} >= ${toSeq}`);
    return null;
  }

  const slicedPoints = shapePoints.filter(
    (p) => p.sequence >= fromSeq && p.sequence <= toSeq
  );

  if (slicedPoints.length < 2) {
    console.log(`[Shape Segment] Not enough shape points after slice`);
    return null;
  }

  const coordinates: [number, number][] = slicedPoints.map((p) => [p.lat, p.lng]);

  const departureSecs = parseGtfsTime(fromStop.departure_time);
  const arrivalSecs = parseGtfsTime(toStop.arrival_time);
  let durationMinutes = Math.round((arrivalSecs - departureSecs) / 60);

  if (durationMinutes < 1) {
    const distKm =
      slicedPoints.length > 1
        ? Math.sqrt(
            Math.pow(slicedPoints[slicedPoints.length - 1].lat - slicedPoints[0].lat, 2) +
              Math.pow(slicedPoints[slicedPoints.length - 1].lng - slicedPoints[0].lng, 2)
          ) * 111
        : 10;
    durationMinutes = Math.max(1, Math.round((distKm / 40) * 60));
  }

  const result: ShapeSegmentResult = { coordinates, durationMinutes };

  shapeSegmentCache.set(cacheKey, result);

  console.log(
    `[Shape Segment] SUCCESS: ${tripId} -> ${coordinates.length} points, ${durationMinutes} mins`
  );

  return result;
}
