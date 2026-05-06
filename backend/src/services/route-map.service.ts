import { Coordinate, RouteSegment } from "../types";
import { distanceMeters } from "../utils/geo";
import { findStopCoordinate } from "./gtfs-stop-indexservice";
import { geocodeAddress } from "./geocoding.service";
import { ptvFindRouteBetweenStops } from "./ptv-api.service";
import axios from "axios";

const log = process.env.NODE_ENV !== "production" ? console.log : () => {};

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

  const base = process.env.OSRM_URL ?? "http://localhost:5000";
  const url = `${base}/route/v1/driving/${coordString}?geometries=geojson&overview=full`;

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
    const dist = distanceMeters(start, end);
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

export async function getPTVRoute(
  fromStation: Coordinate,
  toStation: Coordinate,
  fromName?: string,
  toName?: string
): Promise<{ geometry: number[][]; duration: number } | null> {
  log(`[getPTVRoute] fromName="${fromName}", toName="${toName}"`);

  if (!fromName || !toName) {
    log(`[getPTVRoute] NULL: Missing station names`);
    return null;
  }

  const ptvRoute = await ptvFindRouteBetweenStops(fromName, toName, 0);
  if (ptvRoute) {
    const geometry = ptvRoute.geometry.length >= 2
    ? ptvRoute.geometry
    : [[fromStation.lat, fromStation.lng], [toStation.lat, toStation.lng]];
    return { geometry, duration: ptvRoute.durationSeconds };
  }

  log(`[getPTVRoute] NULL: No route found for "${fromName}" -> "${toName}"`);
  return null;
}

