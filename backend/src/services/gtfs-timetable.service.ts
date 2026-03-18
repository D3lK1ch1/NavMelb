import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse";

interface TripRow {
  trip_id: string;
  route_id: string;
  service_id: string;
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

export { stopIdToCoordinate };

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bstation\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTransportType(feedDir: string): "train" | "tram" | "bus" {
  const folderNum = feedDir.replace(/\D/g, "");
  if (["1", "2", "10"].includes(folderNum)) return "train";
  if (["3"].includes(folderNum)) return "tram";
  return "bus";
}

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

  const feedDirs = fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  console.log("Loading GTFS Timetables...");

  for (const feedDir of feedDirs) {
    const type = getTransportType(feedDir);

    const zipPath = path.join(absoluteRoot, feedDir, "google_transit.zip");
    if (!fs.existsSync(zipPath)) continue;

    try {
      const zip = new AdmZip(zipPath);

      const tripsEntry = zip.getEntry("trips.txt");
      if (tripsEntry) {
        const parser = createParser(tripsEntry.getData());
        for await (const row of parser) {
          const tripRow = row as TripRow;
          const existing = tripIndex.get(tripRow.service_id) || [];
          existing.push(tripRow);
          tripIndex.set(tripRow.service_id, existing);
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
          if (!stopNameToId.has(normalized)) {
            stopNameToId.set(normalized, stopRow.stop_id);
          }
          stopIdToCoordinate.set(stopRow.stop_id, {
            lat: parseFloat(stopRow.stop_lat),
            lng: parseFloat(stopRow.stop_lon),
          });
          stopIdToName.set(stopRow.stop_id, stopRow.stop_name);
        }
      }

      console.log(`Loaded ${type} data from ${feedDir}`);
    } catch (err) {
      console.error(`Failed to load ${feedDir}:`, err);
    }
  }

  console.log(`[GTFS Timetables] Loaded: ${tripIndex.size} trips, ${stopTimesIndex.size} stop_times entries, ${stopNameToId.size} stops`);
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

export interface TransitTrip {
  tripId: string;
  fromStopId: string;
  toStopId: string;
  departureTime: string;
  arrivalTime: string;
  stopSequence: {
    stopId: string;
    stopName: string;
    arrivalTime: string;
    departureTime: string;
  }[];
}

function getStopNameById(stopId: string): string | undefined {
  return stopIdToName.get(stopId);
}

export function getTripBetweenStations(
  fromStationName: string,
  toStationName: string
): TransitTrip | null {
  const fromNormalized = normalizeName(fromStationName);
  const toNormalized = normalizeName(toStationName);

  const fromStopId = stopNameToId.get(fromNormalized);
  const toStopId = stopNameToId.get(toNormalized);

  if (!fromStopId || !toStopId) {
    return null;
  }

  for (const [tripId, stopTimes] of stopTimesIndex) {
    const sortedTimes = [...stopTimes].sort((a, b) => a.stop_sequence - b.stop_sequence);

    const fromIndex = sortedTimes.findIndex(s => s.stop_id === fromStopId);
    const toIndex = sortedTimes.findIndex(s => s.stop_id === toStopId);

    if (fromIndex !== -1 && toIndex !== -1 && fromIndex < toIndex) {
      const fromTime = sortedTimes[fromIndex];
      const toTime = sortedTimes[toIndex];

      const sequence: TransitTrip['stopSequence'] = [];
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

      return {
        tripId,
        fromStopId,
        toStopId,
        departureTime: fromTime.departure_time,
        arrivalTime: toTime.arrival_time,
        stopSequence: sequence,
      };
    }
  }

  return null;
}
