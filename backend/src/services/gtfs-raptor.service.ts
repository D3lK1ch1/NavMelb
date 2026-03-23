import fs from "fs";
import path from "path";
import {
  loadGTFS,
  JourneyFactory,
  RaptorAlgorithmFactory,
  DepartAfterQuery,
  Journey,
} from "raptor-journey-planner";
import { stopNameToId } from "./gtfs-timetable.service";

interface GTFSData {
  raptor: unknown;
  loaded: boolean;
}

const gtfsData: GTFSData = {
  raptor: null,
  loaded: false,
};

const REQUIRED_FILES = [
  "agency.txt",
  "calendar.txt",
  "calendar_dates.txt",
  "routes.txt",
  "stops.txt",
  "stop_times.txt",
  "transfers.txt",
  "trips.txt",
];

const SKIP_FILES = ["shapes.txt", "pathways.txt", "levels.txt", "feed_info.txt"];

export interface RaptorJourney {
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  legs: RaptorLeg[];
}

export interface RaptorLeg {
  type: "transit" | "transfer";
  origin: string;
  destination: string;
  departureTime?: string;
  arrivalTime?: string;
  routeName?: string;
  stopTimes?: { stop: string; arrivalTime: string; departureTime: string }[];
}

function timeToString(seconds: number): string {
  const h = Math.floor(seconds / 3600) % 24;
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function timeToSeconds(timeStr: string): number {
  const [h, m, s] = timeStr.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

function formatJourney(raptorJourney: Journey): RaptorJourney {
  const legs: RaptorLeg[] = raptorJourney.legs.map((leg) => {
    if ("stopTimes" in leg) {
      return {
        type: "transit" as const,
        origin: leg.origin,
        destination: leg.destination,
        departureTime: timeToString(leg.stopTimes[0]?.departureTime || 0),
        arrivalTime: timeToString(leg.stopTimes[leg.stopTimes.length - 1]?.arrivalTime || 0),
        routeName: (leg as { trip?: { tripId?: string } }).trip?.tripId || "Unknown",
        stopTimes: leg.stopTimes.map((st) => ({
          stop: st.stop,
          arrivalTime: timeToString(st.arrivalTime),
          departureTime: timeToString(st.departureTime),
        })),
      };
    } else {
      return {
        type: "transfer" as const,
        origin: leg.origin,
        destination: leg.destination,
        departureTime: timeToString((leg as { startTime: number }).startTime),
        arrivalTime: timeToString((leg as { endTime: number }).endTime),
      };
    }
  });

  const firstLeg = raptorJourney.legs[0];
  let departureSeconds = 0;
  if ("stopTimes" in firstLeg) {
    departureSeconds = (firstLeg as { stopTimes: { departureTime: number }[] }).stopTimes[0]?.departureTime || 0;
  } else {
    departureSeconds = (firstLeg as { startTime: number }).startTime;
  }

  const lastLeg = raptorJourney.legs[raptorJourney.legs.length - 1];
  let arrivalSeconds = 0;
  if ("stopTimes" in lastLeg) {
    const st = lastLeg as { stopTimes: { arrivalTime: number }[] };
    arrivalSeconds = st.stopTimes[st.stopTimes.length - 1]?.arrivalTime || 0;
  } else {
    arrivalSeconds = (lastLeg as { endTime: number }).endTime;
  }

  return {
    departureTime: timeToString(departureSeconds),
    arrivalTime: timeToString(arrivalSeconds),
    durationMinutes: Math.round((arrivalSeconds - departureSeconds) / 60),
    legs,
  };
}

function getTransportType(feedDir: string): "train" | "tram" | "bus" {
  const folderNum = feedDir.replace(/\D/g, "");
  if (["1", "2", "10"].includes(folderNum)) return "train";
  if (["3"].includes(folderNum)) return "tram";
  return "bus";
}

export async function loadGtfsForRaptor(): Promise<void> {
  const gtfsRoot = process.env.GTFS_ROOT || "../gtfs";
  const absoluteRoot = path.resolve(process.cwd(), gtfsRoot);

  if (!fs.existsSync(absoluteRoot)) {
    console.warn("[Raptor] GTFS root not found, skipping Raptor load.");
    return;
  }

  const feedDirs = fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (feedDirs.length === 0) {
    console.warn("[Raptor] No GTFS feeds found.");
    return;
  }

  console.log("[Raptor] Loading GTFS data (trains only for memory efficiency)...");

  let totalTrips = 0;
  let totalStops = 0;

  for (const feedDir of feedDirs) {
    const type = getTransportType(feedDir);
    if (type !== "train") {
      console.log(`[Raptor] Skipping ${feedDir} (${type})`);
      continue;
    }

    const zipPath = path.join(absoluteRoot, feedDir, "google_transit.zip");
    if (!fs.existsSync(zipPath)) continue;

    try {
      console.log(`[Raptor] Processing ${feedDir}...`);
      const stats = fs.statSync(zipPath);
      console.log(`[Raptor] ${feedDir}: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);

      const stream = fs.createReadStream(zipPath);
      const [trips, transfers, interchange, stops] = await loadGTFS(stream);

      totalTrips += trips.length;
      totalStops += Object.keys(stops).length;

      if (!gtfsData.raptor) {
        gtfsData.raptor = RaptorAlgorithmFactory.create(
          trips,
          transfers as any,
          interchange as any
        );
        console.log(`[Raptor] Initialized with ${feedDir}`);
      } else {
        console.log(`[Raptor] Skipped ${feedDir} (already initialized)`);
      }
    } catch (err) {
      console.error(`[Raptor] Failed to load ${feedDir}:`, err);
    }
  }

  if (gtfsData.raptor) {
    gtfsData.loaded = true;
    console.log(`[Raptor] Loaded successfully: ${totalTrips} trips, ${totalStops} stops`);
  } else {
    console.error("[Raptor] Failed to initialize Raptor algorithm");
  }
}

export function queryRaptorJourney(
  fromStationName: string,
  toStationName: string,
  departureTime?: string
): RaptorJourney | null {
  if (!gtfsData.loaded || !gtfsData.raptor) {
    console.log("[Raptor] Not loaded, using fallback");
    return null;
  }

  const fromNormalized = fromStationName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bstation\b/g, "")
    .trim();

  const toNormalized = toStationName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bstation\b/g, "")
    .trim();

  const fromStopId = stopNameToId.get(fromNormalized);
  const toStopId = stopNameToId.get(toNormalized);

  console.log(`[Raptor] Query: "${fromStationName}" -> "${toStationName}"`);
  console.log(`[Raptor] Normalized: "${fromNormalized}" -> "${toNormalized}"`);
  console.log(`[Raptor] Stop IDs: "${fromStopId}" -> "${toStopId}"`);

  if (!fromStopId || !toStopId) {
    console.log("[Raptor] Stop IDs not found");
    return null;
  }

  const raptor = gtfsData.raptor as ReturnType<typeof RaptorAlgorithmFactory.create>;
  const resultsFactory = new JourneyFactory();
  const query = new DepartAfterQuery(raptor, resultsFactory);

  const now = departureTime ? timeToSeconds(departureTime) : 9 * 60 * 60;

  try {
    const journeys = query.plan(fromStopId, toStopId, new Date(), now);

    if (!journeys || journeys.length === 0) {
      console.log("[Raptor] No journeys found");
      return null;
    }

    const bestJourney = journeys[0];
    console.log(
      `[Raptor] Found journey: ${bestJourney.legs.length} legs, ${Math.round((bestJourney.arrivalTime - bestJourney.departureTime) / 60)} mins`
    );

    return formatJourney(bestJourney);
  } catch (err) {
    console.error("[Raptor] Query failed:", err);
    return null;
  }
}

export function isRaptorLoaded(): boolean {
  return gtfsData.loaded;
}
