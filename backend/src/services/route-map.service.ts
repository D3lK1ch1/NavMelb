import { Coordinate, RouteSegment } from "../types";
import { findStopCoordinate } from "./gtfs-stop-indexservice";
import { geocodeAddress } from "./geocoding.service";
import { getTripBetweenStations, getShapeSegment, stopIdToCoordinate } from "./gtfs-timetable.service";
import { queryRaptorJourney, isRaptorLoaded, RaptorJourney } from "./gtfs-raptor.service";
import axios from "axios";

export function calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
  const R = 6371;
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) *
      Math.cos(toRad(coord2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
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
): { geometry: number[][]; duration: number } {
  console.log(`[getPTVRoute] fromName="${fromName}", toName="${toName}"`);

  if (fromName && toName) {
    if (isRaptorLoaded()) {
      const raptorJourney = queryRaptorJourney(fromName, toName);

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
            `[getPTVRoute] SUCCESS: Raptor journey with ${raptorJourney.legs.length} legs, ${raptorJourney.durationMinutes} mins`
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
    }
  }

  console.log(`[getPTVRoute] FALLBACK: Using straight line`);
  const geometry = [
    [fromStation.lat, fromStation.lng],
    [toStation.lat, toStation.lng],
  ];
  const distKm = calculateDistance(fromStation, toStation) / 1000;
  const duration = (distKm / 40) * 3600;
  return { geometry, duration };
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
