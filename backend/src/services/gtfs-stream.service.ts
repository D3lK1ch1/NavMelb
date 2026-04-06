import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse";

const log = process.env.NODE_ENV !== "production" ? console.log : () => {};

export interface StreamStop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  location_type: number;
}

export interface StreamStopTime {
  trip_id: string;
  stop_id: string;
  arrival_time: string;
  departure_time: string;
  stop_sequence: number;
}

export interface StreamTrip {
  trip_id: string;
  route_id: string;
  service_id: string;
  direction_id: number;
  shape_id?: string;
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

export async function* streamStopsFromZip(
  zipPath: string
): AsyncGenerator<StreamStop, void, undefined> {
  if (!fs.existsSync(zipPath)) return;

  try {
    const zip = new AdmZip(zipPath);
    const entry = zip.getEntry("stops.txt");
    if (!entry) return;

    const parser = createParser(entry.getData());
    for await (const row of parser) {
      yield {
        stop_id: row.stop_id,
        stop_name: row.stop_name,
        stop_lat: parseFloat(row.stop_lat) || 0,
        stop_lon: parseFloat(row.stop_lon) || 0,
        location_type: parseInt(row.location_type || "0", 10),
      };
    }
  } catch (err) {
    console.error(`[Stream] Error reading stops from ${zipPath}:`, err);
  }
}

export async function* streamStopTimesFromZip(
  zipPath: string
): AsyncGenerator<StreamStopTime, void, undefined> {
  if (!fs.existsSync(zipPath)) return;

  try {
    const zip = new AdmZip(zipPath);
    const entry = zip.getEntry("stop_times.txt");
    if (!entry) return;

    const parser = createParser(entry.getData());
    for await (const row of parser) {
      yield {
        trip_id: row.trip_id,
        stop_id: row.stop_id,
        arrival_time: row.arrival_time,
        departure_time: row.departure_time,
        stop_sequence: parseInt(row.stop_sequence || "0", 10),
      };
    }
  } catch (err) {
    console.error(`[Stream] Error reading stop_times from ${zipPath}:`, err);
  }
}

export async function* streamTripsFromZip(
  zipPath: string
): AsyncGenerator<StreamTrip, void, undefined> {
  if (!fs.existsSync(zipPath)) return;

  try {
    const zip = new AdmZip(zipPath);
    const entry = zip.getEntry("trips.txt");
    if (!entry) return;

    const parser = createParser(entry.getData());
    for await (const row of parser) {
      yield {
        trip_id: row.trip_id,
        route_id: row.route_id || "",
        service_id: row.service_id || "",
        direction_id: parseInt(row.direction_id || "0", 10),
        shape_id: row.shape_id,
      };
    }
  } catch (err) {
    console.error(`[Stream] Error reading trips from ${zipPath}:`, err);
  }
}

export interface StreamFeedResult {
  stops: StreamStop[];
  trips: StreamTrip[];
  stopTimes: StreamStopTime[];
}

export async function streamFeedData(
  feedDir: string,
  gtfsRoot: string
): Promise<StreamFeedResult> {
  const zipPath = path.join(gtfsRoot, feedDir, "google_transit.zip");
  const stats = fs.existsSync(zipPath)
    ? fs.statSync(zipPath)
    : { size: 0 };
  log(`[Stream] Loading ${feedDir}: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);

  const stops: StreamStop[] = [];
  const trips: StreamTrip[] = [];
  const stopTimes: StreamStopTime[] = [];

  for await (const stop of streamStopsFromZip(zipPath)) {
    stops.push(stop);
  }
  log(`[Stream] ${feedDir}: ${stops.length} stops`);

  for await (const trip of streamTripsFromZip(zipPath)) {
    trips.push(trip);
  }
  log(`[Stream] ${feedDir}: ${trips.length} trips`);

  let count = 0;
  for await (const st of streamStopTimesFromZip(zipPath)) {
    stopTimes.push(st);
    count++;
  }
  log(`[Stream] ${feedDir}: ${count} stop_times`);

  return { stops, trips, stopTimes };
}
