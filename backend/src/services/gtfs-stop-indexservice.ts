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
  transportType: TransportType;
}

const stopIndex = new Map<string, StopEntry>();

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
        stopIndex.set(name, { position: { lat, lng }, transportType });
      } else if (existing.transportType === "bus" && transportType !== "bus") {
        stopIndex.set(name, { position: { lat, lng }, transportType });
      }
    }
  }
}

export function findStopCoordinate(query: string): { position: Coordinate; transportType: TransportType } | null {
  const key = normalizeName(query);
  return stopIndex.get(key) || null;
}

export interface StopInfo {
  name: string;
  position: Coordinate;
  transportType: TransportType;
}

export function getAllStops(): StopInfo[] {
  const stops: StopInfo[] = [];
  stopIndex.forEach((entry, name) => {
    stops.push({ name, position: entry.position, transportType: entry.transportType });
  });
  return stops.sort((a, b) => a.name.localeCompare(b.name));
}

export function getStopsByType(type: TransportType): StopInfo[] {
  return getAllStops().filter((s) => s.transportType === type);
}
