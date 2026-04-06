import fs from "fs";
import path from "path";
import { RaptorCore, RaptorJourney } from "./raptor-core";
import { streamFeedData, StreamStop, StreamTrip, StreamStopTime } from "./gtfs-stream.service";

const log = process.env.NODE_ENV !== "production" ? console.log : () => {};

interface GTFSData {
  raptor: RaptorCore | null;
  loaded: boolean;
}

const gtfsData: GTFSData = {
  raptor: null,
  loaded: false,
};

function getTransportType(feedDir: string): "train" | "tram" | "bus" {
  const folderNum = feedDir.replace(/\D/g, "");
  if (["1", "2", "10"].includes(folderNum)) return "train";
  if (["3"].includes(folderNum)) return "tram";
  return "bus";
}

export interface RaptorResultJourney {
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  legs: {
    type: "transit" | "transfer";
    origin: string;
    destination: string;
    originName: string;
    destinationName: string;
    departureTime: string;
    arrivalTime: string;
    routeName: string;
    stopTimes?: { stop: string; arrivalTime: string; departureTime: string }[];
  }[];
}

function timeToString(seconds: number): string {
  const h = Math.floor(seconds / 3600) % 24;
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export async function loadRaptorStreaming(): Promise<void> {
  const gtfsRoot = process.env.GTFS_ROOT || "../gtfs";
  const absoluteRoot = path.resolve(process.cwd(), gtfsRoot);

  if (!fs.existsSync(absoluteRoot)) {
    console.warn("[Raptor] GTFS root not found, skipping.");
    return;
  }

  const feedDirs = fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const trainFeeds = feedDirs
    .filter((d) => getTransportType(d) === "train")
    .filter((d) => {
      const zipPath = path.join(absoluteRoot, d, "google_transit.zip");
      return fs.existsSync(zipPath);
    });

  if (trainFeeds.length === 0) {
    console.warn("[Raptor] No train feeds found.");
    return;
  }

  log(`[Raptor] Loading ${trainFeeds.length} train feeds...`);
  log(`[Raptor] Memory before load: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);

  const raptor = new RaptorCore();
  const allStops: StreamStop[] = [];
  const allTrips: StreamTrip[] = [];
  const allStopTimes: StreamStopTime[] = [];

  for (const feedDir of trainFeeds) {
    log(`[Raptor] Loading ${feedDir}...`);
    const result = await streamFeedData(feedDir, absoluteRoot);
    for (const s of result.stops) allStops.push(s);
    for (const t of result.trips) allTrips.push(t);
    for (const st of result.stopTimes) allStopTimes.push(st);
    log(`[Raptor] Memory after ${feedDir}: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
  }

  log(`[Raptor] Total: ${allStops.length} stops, ${allTrips.length} trips, ${allStopTimes.length} stop_times`);
  log(`[Raptor] Initializing Raptor core...`);

  raptor.initialize(allStops, allTrips, allStopTimes);

  allStops.length = 0;
  allTrips.length = 0;
  allStopTimes.length = 0;

  log(`[Raptor] Memory after GC: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);

  gtfsData.raptor = raptor;
  gtfsData.loaded = true;

  const stats = raptor.getStats();
  log(`[Raptor] Ready: ${stats.stops} stops, ${stats.trips} trips`);
}

export function isRaptorLoaded(): boolean {
  return gtfsData.loaded && gtfsData.raptor !== null;
}

export function queryRaptorJourney(
  fromStationName: string,
  toStationName: string,
  departureTime?: string
): RaptorResultJourney | null {
  if (!isRaptorLoaded()) {
    log("[Raptor] Not loaded");
    return null;
  }

  const raptor = gtfsData.raptor!;

  const fromNormalized = fromStationName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bstation\b/g, "")
    .replace(/\brailway\b/g, "")
    .trim();

  const toNormalized = toStationName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bstation\b/g, "")
    .replace(/\brailway\b/g, "")
    .trim();

  const fromStop = raptor.findStopByName(fromNormalized);
  const toStop = raptor.findStopByName(toNormalized);

  log(`[Raptor] Query: "${fromStationName}" -> "${toStationName}"`);
  log(`[Raptor] Normalized: "${fromNormalized}" -> "${toNormalized}"`);
  log(`[Raptor] Stop IDs: "${fromStop?.id}" -> "${toStop?.id}"`);

  if (!fromStop || !toStop) {
    log("[Raptor] Stop IDs not found");
    return null;
  }

  const timeSeconds = departureTime
    ? parseTime(departureTime)
    : 9 * 3600;

  const journey = raptor.query(fromStop.id, toStop.id, timeSeconds);

  if (!journey) {
    log("[Raptor] No journey found");
    return null;
  }

  const legs = journey.legs.map((leg) => ({
    type: "transit" as const,
    origin: leg.fromStopId,
    destination: leg.toStopId,
    originName: leg.fromStopName,
    destinationName: leg.toStopName,
    departureTime: timeToString(leg.fromTime),
    arrivalTime: timeToString(leg.toTime),
    routeName: leg.trip.routeId || leg.trip.id,
    stopTimes: leg.trip.stopTimes.map((st) => ({
      stop: st.stopId,
      arrivalTime: timeToString(st.arrivalTime),
      departureTime: timeToString(st.departureTime),
    })),
  }));

  log(`[Raptor] Journey: ${journey.legs.length} legs, ${journey.durationMinutes} mins`);

  return {
    departureTime: timeToString(journey.departureTime),
    arrivalTime: timeToString(journey.arrivalTime),
    durationMinutes: journey.durationMinutes,
    legs,
  };
}

function parseTime(time: string): number {
  if (!time || time.length < 5) return 9 * 3600;
  const parts = time.split(":").map(Number);
  const h = isNaN(parts[0]) ? 0 : parts[0];
  const m = isNaN(parts[1]) ? 0 : parts[1];
  const s = isNaN(parts[2]) ? 0 : parts[2];
  return h * 3600 + m * 60 + s;
}

export function getRaptorStats(): { stops: number; trips: number; loaded: boolean } {
  if (!gtfsData.raptor) {
    return { stops: 0, trips: 0, loaded: false };
  }
  return gtfsData.raptor.getStats();
}
