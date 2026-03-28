import { Coordinate, RouteSegment } from "../types";
import { distanceMeters } from "../utils/geo";
import { findStopCoordinate } from "./gtfs-stop-indexservice";
import { geocodeAddress } from "./geocoding.service";
import { getTripBetweenStations, getShapeSegment, stopIdToCoordinate } from "./gtfs-timetable.service";
import { queryRaptorJourney as queryStreamingRaptor, isRaptorLoaded as isStreamingRaptorLoaded } from "./gtfs-raptor-streaming.service";
import axios from "axios";

export function calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
  return distanceMeters(coord1, coord2);
}

export function lookupDestination(query: string): Coordinate | null {
  const result = findStopCoordinate(query);
  return result ? result.position : null;
}

export async function lookupDestinationAny(query: string): Promise<Coordinate | null> {
  const stop = findStopCoordinate(query);
  if (stop) return stop.position;
  return await geocodeAddress(query);
}

export async function osrmRoute(
  start: Coordinate,
  end: Coordinate,
  waypoints?: Coordinate[]
): Promise<{ geometry: number[][]; distance: number; duration: number }> {
  const coords = [
    [start.lng, start.lat],
    ...(waypoints || []).map((w) => [w.lng, w.lat]),
    [end.lng, end.lat],
  ];
  const coordString = coords.map((c) => c.join(",")).join(";");

  const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?geometries=geojson&overview=full`;

  try {
    const response = await axios.get(url, { timeout: 10000 });
    if (response.data.code !== "Ok") {
      throw new Error(response.data.message || "OSRM routing failed");
    }
    const route = response.data.routes[0];
    return {
      geometry: route.geometry.coordinates.map((c: number[]) => [c[1], c[0]]),
      distance: route.distance,
      duration: route.duration,
    };
  } catch (error) {
    console.error("OSRM request failed, using fallback:", error);
    const dist = calculateDistance(start, end);
    return {
      geometry: [
        [start.lat, start.lng],
        [end.lat, end.lng],
      ],
      distance: dist,
      duration: (dist / 1000 / 50) * 3600,
    };
  }
}

export function getPTVRoute(
  fromStation: Coordinate,
  toStation: Coordinate,
  fromName?: string,
  toName?: string
): { geometry: number[][]; duration: number } | null {
  console.log(`[getPTVRoute] fromName="${fromName}", toName="${toName}"`);

  if (fromName && toName) {
    if (isStreamingRaptorLoaded()) {
      const raptorJourney = queryStreamingRaptor(fromName, toName);

      if (raptorJourney) {
        const geometry: number[][] = [];

        for (const leg of raptorJourney.legs) {
          if (leg.type === "transit" && leg.stopTimes) {
            for (const st of leg.stopTimes) {
              const coord = stopIdToCoordinate.get(st.stop);
              if (coord) {
                geometry.push([coord.lat, coord.lng]);
              }
            }
          }
        }

        if (geometry.length >= 2) {
          console.log(
            `[getPTVRoute] SUCCESS: Streaming Raptor journey with ${raptorJourney.legs.length} legs, ${raptorJourney.durationMinutes} mins`
          );
          return {
            geometry,
            duration: raptorJourney.durationMinutes * 60,
          };
        }
      }
    }

    const trip = getTripBetweenStations(fromName, toName);

    if (trip) {
      switch (trip.kind) {
        case "multi-leg": {
          const geometry: number[][] = [];

          for (const leg of trip.legs) {
            for (const stop of leg.stopSequence) {
              const coord = stopIdToCoordinate.get(stop.stopId);
              if (coord) {
                geometry.push([coord.lat, coord.lng]);
              }
            }
          }

          if (geometry.length >= 2) {
            console.log(
              `[getPTVRoute] SUCCESS: Multi-leg trip via "${trip.viaStation}", ${trip.legs.length} legs, ${trip.totalDurationMinutes} mins`
            );
            return {
              geometry,
              duration: trip.totalDurationMinutes * 60,
            };
          }
          break;
        }
        case "direct": {
          const shapeSegment = getShapeSegment(trip.tripId, trip.fromStopId, trip.toStopId);

          if (shapeSegment) {
            console.log(
              `[getPTVRoute] SUCCESS: Shape geometry with ${shapeSegment.coordinates.length} points, ${shapeSegment.durationMinutes} mins`
            );
            return {
              geometry: shapeSegment.coordinates,
              duration: shapeSegment.durationMinutes * 60,
            };
          }

          if (trip.stopSequence.length > 0) {
            const geometry: number[][] = [];

            for (const stop of trip.stopSequence) {
              const coord = stopIdToCoordinate.get(stop.stopId);
              if (coord) {
                geometry.push([coord.lat, coord.lng]);
              }
            }

            if (geometry.length >= 2) {
              const [fromH, fromM, fromS] = trip.departureTime.split(":").map(Number);
              const [toH, toM, toS] = trip.arrivalTime.split(":").map(Number);
              let durationSec = toH * 3600 + toM * 60 + toS - (fromH * 3600 + fromM * 60 + fromS);
              if (durationSec < 0) durationSec += 24 * 3600;

              console.log(
                `[getPTVRoute] SUCCESS: Stop coords geometry with ${geometry.length} stops, ${Math.round(durationSec / 60)} mins`
              );
              return { geometry, duration: durationSec };
            }
          }
          break;
        }
      }
    }
  }

  console.log(`[getPTVRoute] NULL: No route found for "${fromName}" -> "${toName}"`);
  return null;
}

function addSecondsToTime(time: string, seconds: number): string {
  const parts = time.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  const total = h * 3600 + m * 60 + s + Math.round(seconds);
  const hh = Math.floor(total / 3600) % 24;
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export type ChainResult =
  | { ok: true; legs: Array<{ geometry: number[][]; duration: number; arrivalTime: string }> }
  | { ok: false; failedLeg: number; from: string; to: string };

export function chainJourneyLegs(
  stops: Array<{ coord: Coordinate; name: string }>,
  departureTime: string
): ChainResult {
  if (stops.length < 2) {
    return { ok: false, failedLeg: 0, from: stops[0]?.name ?? "unknown", to: "unknown" };
  }

  const legs: Array<{ geometry: number[][]; duration: number; arrivalTime: string }> = [];
  let currentTime = departureTime;

  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];
    const result = getPTVRoute(from.coord, to.coord, from.name, to.name);
    if (result === null) {
      return { ok: false, failedLeg: i, from: from.name, to: to.name };
    }
    const arrivalTime = addSecondsToTime(currentTime, result.duration);
    legs.push({ ...result, arrivalTime });
    currentTime = arrivalTime;
  }

  return { ok: true, legs };
}

export async function calculateMultiStopRoute(
  start: Coordinate,
  stops: Coordinate[],
  end: Coordinate
): Promise<{ segments: RouteSegment[]; totalDistance: number; totalDuration: number }> {
  const segments: RouteSegment[] = [];
  let totalDistance = 0;
  let totalDuration = 0;

  let currentPos = start;

  for (let i = 0; i < stops.length; i++) {
    const station = stops[i];
    const carRoute = await osrmRoute(currentPos, station);
    segments.push({
      type: "car",
      coordinates: carRoute.geometry,
      color: "#2196F3",
      distance: carRoute.distance,
      duration: carRoute.duration,
    });
    totalDistance += carRoute.distance;
    totalDuration += carRoute.duration;
    currentPos = station;
  }

  if (currentPos.lat !== end.lat || currentPos.lng !== end.lng) {
    const finalCarRoute = await osrmRoute(currentPos, end);
    segments.push({
      type: "car",
      coordinates: finalCarRoute.geometry,
      color: "#2196F3",
      distance: finalCarRoute.distance,
      duration: finalCarRoute.duration,
    });
    totalDistance += finalCarRoute.distance;
    totalDuration += finalCarRoute.duration;
  }

  return { segments, totalDistance, totalDuration };
}
