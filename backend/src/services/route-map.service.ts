import { Coordinate, RouteSegment } from "../types";
import { distanceMeters } from "../utils/geo";
import { ptvFindRouteBetweenStops } from "./ptv-api.service";
import axios from "axios";
import { dispatch } from "../events/dispatch";

export function calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
  return distanceMeters(coord1, coord2);
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
    dispatch({ type: "external.api.failed", service: "osrm", endpoint: url, error });
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

export async function getPTVRoute(
  fromStation: Coordinate,
  toStation: Coordinate,
  fromName?: string,
  toName?: string,
  routeType: number = 0
): Promise<{ geometry: number[][]; duration: number } | null> {
  if (!fromName || !toName) {
    return null;
  }

  const ptvRoute = await ptvFindRouteBetweenStops(fromName, toName, routeType);
  if (ptvRoute) {
    const geometry = ptvRoute.geometry.length >= 2
    ? ptvRoute.geometry
    : [[fromStation.lat, fromStation.lng], [toStation.lat, toStation.lng]];
    return { geometry, duration: ptvRoute.durationSeconds };
  }

  const dist = distanceMeters(fromStation, toStation);
  return {
    geometry: [
      [fromStation.lat, fromStation.lng],
      [toStation.lat, toStation.lng],
    ],
    duration: Math.round(dist / 11), // ~40 km/h in m/s
  };
}
