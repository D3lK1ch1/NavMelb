import fs from "fs";
import path from "path";

export type TransportType = "train" | "tram" | "bus";

/**
 * Maps a GTFS feed directory name (e.g. "3-tram") to a transport type.
 * Uses the leading numeric prefix to determine type.
 */
export function getTransportType(feedDir: string): TransportType {
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

/**
 * Resolves and validates the GTFS root directory.
 * Uses GTFS_ROOT env var, falling back to "../gtfs" relative to cwd.
 * Throws if the directory does not exist.
 */
export function resolveGtfsRoot(): string {
  const gtfsRoot = process.env.GTFS_ROOT || "../gtfs";
  const absoluteRoot = path.resolve(process.cwd(), gtfsRoot);

  if (!fs.existsSync(absoluteRoot)) {
    throw new Error(`GTFS root not found: ${absoluteRoot}`);
  }

  return absoluteRoot;
}
