import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { Coordinate } from "../types";

type StopRow = {
  stop_name: string;
  stop_lat: string;
  stop_lon: string;
};

export type TransportType = "tram" | "train" | "bus";

export interface StopEntry {
  position: Coordinate;
  transportTypes: Set<TransportType>;
}

const stopIndex = new Map<string, StopEntry>();
const proximityMergeMeters = 150;
let cachedStops: StopInfo[] | null = null;

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function distanceMeters(coord1: Coordinate, coord2: Coordinate): number {
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

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bstation\b/g, "")
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
        stopIndex.set(name, { position: { lat, lng }, transportTypes: new Set([transportType]) });
      } else {
        existing.transportTypes.add(transportType);
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

export function findStopCoordinate(query: string): { position: Coordinate; transportTypes: TransportType[] } | null {
  const key = normalizeName(query);
  const entry = stopIndex.get(key);
  if (!entry) return null;
  return { position: entry.position, transportTypes: Array.from(entry.transportTypes).sort() };
}

export interface StopInfo {
  name: string;
  position: Coordinate;
  transportTypes: TransportType[];
}

export function getAllStops(): StopInfo[] {
  if (cachedStops) return cachedStops;

  const stops: StopInfo[] = [];
  stopIndex.forEach((entry, name) => {
    stops.push({ name, position: entry.position, transportTypes: Array.from(entry.transportTypes).sort() });
  });
  cachedStops = stops.sort((a, b) => a.name.localeCompare(b.name));
  return cachedStops;
}

export function getStopsByType(type: TransportType): StopInfo[] {
  return getAllStops().filter((s) => s.transportTypes.includes(type));
}
