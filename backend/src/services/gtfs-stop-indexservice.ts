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

const stopIndex = new Map<string, Coordinate>();

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bstation\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

    const zip = new AdmZip(zipPath);
    const entry = zip.getEntry("stops.txt");
    if (!entry) {
      continue;
    }

    const csv = entry.getData().toString("utf8");
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

      if (!stopIndex.has(name)) {
        stopIndex.set(name, { lat, lng });
      }
    }
  }
}

export function findStopCoordinate(query: string): Coordinate | null {
  const key = normalizeName(query);
  return stopIndex.get(key) || null;
}
