import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";

type TripRow = {
  trip_id: string;
  route_id: string;
  service_id: string;
};

type StopTimeRow = {
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: string;
};

type StopRow = {
  stop_id: string;
  stop_name: string;
};

const tripIndex = new Map<string, TripRow[]>();
const stopTimesIndex = new Map<string, StopTimeRow[]>();
const stopNameToId = new Map<string, string>();

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bstation\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function loadGtfsTimetables(): void {
  const gtfsRoot = process.env.GTFS_ROOT || "../gtfs";
  const absoluteRoot = path.resolve(process.cwd(), gtfsRoot);

  tripIndex.clear();
  stopTimesIndex.clear();
  stopNameToId.clear();

  const feedDirs = fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const feedDir of feedDirs) {
    const zipPath = path.join(absoluteRoot, feedDir, "google_transit.zip");
    if (!fs.existsSync(zipPath)) continue;

    const zip = new AdmZip(zipPath);

    const tripsEntry = zip.getEntry("trips.txt");
    if (tripsEntry) {
      const csv = tripsEntry.getData();
      const rows = parse(csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as TripRow[];
      for (const row of rows) {
        const existing = tripIndex.get(row.service_id) || [];
        existing.push(row);
        tripIndex.set(row.service_id, existing);
      }
    }

    const stopTimesEntry = zip.getEntry("stop_times.txt");
    if (stopTimesEntry) {
      const csv = stopTimesEntry.getData();
      const rows = parse(csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as StopTimeRow[];
      for (const row of rows) {
        const existing = stopTimesIndex.get(row.trip_id) || [];
        existing.push(row);
        stopTimesIndex.set(row.trip_id, existing);
      }
    }

    const stopsEntry = zip.getEntry("stops.txt");
    if (stopsEntry) {
      const csv = stopsEntry.getData();
      const rows = parse(csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as StopRow[];
      for (const row of rows) {
        const normalized = normalizeName(row.stop_name);
        if (!stopNameToId.has(normalized)) {
          stopNameToId.set(normalized, row.stop_id);
        }
      }
    }
  }
}

export function getNextDepartureTime(stationName: string): { time: string; waitMinutes: number } | null {
  const normalized = normalizeName(stationName);
  const stopId = stopNameToId.get(normalized);
  if (!stopId) return null;

  const now = new Date();
  const currentTime = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  for (const [, trips] of tripIndex) {
    for (const trip of trips) {
      const times = stopTimesIndex.get(trip.trip_id);
      if (!times) continue;

      const stationTimes = times
        .filter((t) => t.stop_id === stopId)
        .sort((a, b) => a.stop_sequence.localeCompare(b.stop_sequence));

      for (const st of stationTimes) {
        const [hours, minutes, seconds] = st.departure_time.split(":").map(Number);
        const departureSeconds = hours * 3600 + minutes * 60 + seconds;

        if (departureSeconds > currentTime) {
          const waitSeconds = departureSeconds - currentTime;
          return {
            time: st.departure_time,
            waitMinutes: Math.ceil(waitSeconds / 60),
          };
        }
      }
    }
  }

  return null;
}

export function findDeparturesForWaypoints(
  waypoints: { name?: string; position: { lat: number; lng: number } }[]
): { stationName: string; nextDeparture: string; waitTimeMinutes: number }[] {
  const results: { stationName: string; nextDeparture: string; waitTimeMinutes: number }[] = [];

  for (const wp of waypoints) {
    if (wp.name) {
      const departure = getNextDepartureTime(wp.name);
      if (departure) {
        results.push({
          stationName: wp.name,
          nextDeparture: departure.time,
          waitTimeMinutes: departure.waitMinutes,
        });
      }
    }
  }

  return results;
}
