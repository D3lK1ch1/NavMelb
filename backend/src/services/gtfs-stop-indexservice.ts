import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { Coordinate } from "../types";
import { distanceMeters } from "../utils/geo";
import { streamStopTimesFromZip } from "./gtfs-stream.service";

const log = process.env.NODE_ENV !== "production" ? console.log : () => {};

type StopRow = {
  stop_id: string;
  stop_name: string;
  stop_lat: string;
  stop_lon: string;
};

export type TransportType = "tram" | "train" | "bus";

export interface StopEntry {
  position: Coordinate;
  transportTypes: Set<TransportType>;
  displayName: string;
  stopIds: Set<string>;
}

const stopIndex = new Map<string, StopEntry>();
const proximityMergeMeters = 150;
let cachedStops: StopInfo[] | null = null;

// stopId → unique route names (populated by loadRouteAssociations)
const stopRouteNames = new Map<string, Set<string>>();

export { distanceMeters };

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

function getTransportType(feedDir: string): TransportType {
  const folderNum = feedDir.replace(/\D/g, "");
  const mapping: Record<string, TransportType> = {
    "1": "train",
    "2": "train",
    "3": "tram",
    "4": "bus",
    "5": "bus",
    "6": "bus",
    "10": "train",
    "11": "bus",
  };
  return mapping[folderNum] || "bus";
}

export function loadGtfsStops(): void {
  const gtfsRoot = process.env.GTFS_ROOT || "../gtfs";
  const absoluteRoot = path.resolve(process.cwd(), gtfsRoot);

  if (!fs.existsSync(absoluteRoot)) {
    throw new Error(`GTFS root not found: ${absoluteRoot}`);
  }

  const feedDirs = fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  stopIndex.clear();
  cachedStops = null;

  for (const feedDir of feedDirs) {
    const zipPath = path.join(absoluteRoot, feedDir, "google_transit.zip");
    if (!fs.existsSync(zipPath)) {
      continue;
    }

    const transportType = getTransportType(feedDir);

    const zip = new AdmZip(zipPath);
    const entry = zip.getEntry("stops.txt");
    if (!entry) {
      continue;
    }

    const csv = entry.getData();
    const rows = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as StopRow[];

    for (const row of rows) {
      const lat = Number(row.stop_lat);
      const lng = Number(row.stop_lon);
      const name = normalizeName(row.stop_name || "");

      if (!name || Number.isNaN(lat) || Number.isNaN(lng)) {
        continue;
      }

      const existing = stopIndex.get(name);
      if (!existing) {
        stopIndex.set(name, {
          position: { lat, lng },
          transportTypes: new Set([transportType]),
          displayName: (row.stop_name || "").trim(),
          stopIds: new Set([row.stop_id]),
        });
      } else {
        existing.transportTypes.add(transportType);
        existing.stopIds.add(row.stop_id);
        const dist = distanceMeters(existing.position, { lat, lng });
        if (dist <= proximityMergeMeters) {
          existing.position = {
            lat: (existing.position.lat + lat) / 2,
            lng: (existing.position.lng + lng) / 2,
          };
        }
      }
    }
  }
}

export async function loadRouteAssociations(): Promise<void> {
  const gtfsRoot = process.env.GTFS_ROOT || "../gtfs";
  const absoluteRoot = path.resolve(process.cwd(), gtfsRoot);

  if (!fs.existsSync(absoluteRoot)) return;

  const feedDirs = fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const feedDir of feedDirs) {
    const zipPath = path.join(absoluteRoot, feedDir, "google_transit.zip");
    if (!fs.existsSync(zipPath)) continue;

    const transportType = getTransportType(feedDir);
    const zip = new AdmZip(zipPath);

    // Load routes.txt (small) → routeId → display name
    const routesEntry = zip.getEntry("routes.txt");
    if (!routesEntry) continue;

    type RouteRow = { route_id: string; route_short_name: string; route_long_name: string };
    const routeRows = parse(routesEntry.getData(), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as RouteRow[];

    const routeNameMap = new Map<string, string>();
    for (const r of routeRows) {
      // Train/tram: long name is more descriptive (e.g. "Pakenham Line")
      // Bus: short name is what riders know (e.g. "703")
      const name =
        transportType === "train" || transportType === "tram"
          ? r.route_long_name || r.route_short_name
          : r.route_short_name || r.route_long_name;
      if (name) routeNameMap.set(r.route_id, name.trim());
    }

    // Load trips.txt (medium) → tripId → routeId
    const tripsEntry = zip.getEntry("trips.txt");
    if (!tripsEntry) continue;

    type TripRow = { trip_id: string; route_id: string };
    const tripRows = parse(tripsEntry.getData(), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as TripRow[];

    const tripToRoute = new Map<string, string>();
    for (const t of tripRows) {
      tripToRoute.set(t.trip_id, t.route_id);
    }

    // Stream stop_times.txt (large) to map stopId → route names (capped at 5 per stop)
    for await (const st of streamStopTimesFromZip(zipPath)) {
      const existing = stopRouteNames.get(st.stop_id);
      if (existing && existing.size >= 5) continue;

      const routeId = tripToRoute.get(st.trip_id);
      if (!routeId) continue;

      const routeName = routeNameMap.get(routeId);
      if (!routeName) continue;

      if (!stopRouteNames.has(st.stop_id)) {
        stopRouteNames.set(st.stop_id, new Set());
      }
      stopRouteNames.get(st.stop_id)!.add(routeName);
    }

    log(`[GTFS Routes] ${feedDir}: route associations loaded`);
  }

  // Clear the stop cache so the next getAllStops() call includes route names
  cachedStops = null;
  log(`[GTFS Routes] Route associations complete for ${stopRouteNames.size} stops`);
}

export function findStopCoordinate(query: string): { position: Coordinate; transportTypes: TransportType[]; displayName: string } | null {
  const key = normalizeName(query);
  const entry = stopIndex.get(key);
  if (!entry) return null;
  return {
    position: entry.position,
    transportTypes: Array.from(entry.transportTypes).sort(),
    displayName: entry.displayName,
  };
}

export interface StopInfo {
  name: string;
  position: Coordinate;
  transportTypes: TransportType[];
  displayName: string;
  routeNames: string[];
}

export function getAllStops(): StopInfo[] {
  if (cachedStops) return cachedStops;

  const stops: StopInfo[] = [];
  stopIndex.forEach((entry, name) => {
    const routeSet = new Set<string>();
    for (const stopId of entry.stopIds) {
      const names = stopRouteNames.get(stopId);
      if (names) names.forEach((n) => routeSet.add(n));
    }
    stops.push({
      name,
      position: entry.position,
      transportTypes: Array.from(entry.transportTypes).sort(),
      displayName: entry.displayName,
      routeNames: Array.from(routeSet).slice(0, 5),
    });
  });
  cachedStops = stops.sort((a, b) => a.name.localeCompare(b.name));
  return cachedStops;
}

export function getStopsByType(type: TransportType): StopInfo[] {
  return getAllStops().filter((s) => s.transportTypes.includes(type));
}

export function findNearestStation(coord: Coordinate, maxDistanceMeters: number = 1500): StopInfo | null {
  const stops = getAllStops();
  let nearest: StopInfo | null = null;
  let nearestDist = Infinity;

  for (const stop of stops) {
    const dist = distanceMeters(coord, stop.position);
    if (dist < nearestDist && dist <= maxDistanceMeters) {
      nearestDist = dist;
      nearest = stop;
    }
  }

  if (nearest) {
    log(`[Nearest Station] Found "${nearest.name}" at ${Math.round(nearestDist)}m from destination`);
  } else {
    log(`[Nearest Station] No station within ${maxDistanceMeters}m of destination`);
  }

  return nearest;
}
