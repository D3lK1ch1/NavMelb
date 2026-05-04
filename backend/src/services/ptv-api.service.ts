import axios, { AxiosInstance } from "axios";
import crypto from "node:crypto";

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface PTVStop {
  stopId: number;
  stopName: string;
  position: Coordinate;
  routeTypes: number[];
  displayName: string;
}

export interface PTVDeparture {
  routeId: number;
  routeName: string;
  directionId: number;
  directionName: string;
  scheduledDepartureUtc: string;
  estimatedDepartureUtc?: string;
  platformNumber?: string;
  runRef: string;
}

export interface PTVDirection {
  directionId: number;
  directionName: string;
  routeId: number;
  routeType: number;
  routeDirectionDescription: string;
}

export interface PTvPatternGeometry {
  runRef: string;
  routeId: number;
  routeType: number;
  stops: Array<{ stopId: number; stopSequence: number }>;
  geometry: number[][];
}

export interface PTvRouteResult {
  geometry: number[][];
  durationSeconds: number;
  platformNumber?: string;
}

const baseUrl = "https://timetableapi.ptv.vic.gov.au/v3";
const AVG_DWELL_SECONDS = 90;

let devId = "";
let apiKey = "";
let client: AxiosInstance | null = null;

function getClient(): AxiosInstance {
  if (!client) {
    devId = process.env.PTV_DEV_ID || "";
    apiKey = process.env.PTV_API_KEY || "";
    if (!devId || !apiKey) {
      throw new Error("PTV credentials not configured in .env");
    }
    client = axios.create({
      baseURL: baseUrl,
      params: { devid: devId },
      headers: {
        "X-Developer-Id": devId,
        "X-API-Key": apiKey,
      },
      timeout: 30000,
    });

    client.interceptors.request.use((config) => {
      const basePath = new URL(baseUrl).pathname;

      const allParams: Record<string, string | number> = {
        devid: devId,
        ...(config.params || {}),
      };

      const sortedKeys = Object.keys(allParams).sort();
      const queryStringWithoutSig = sortedKeys
        .map((k) => `${k}=${encodeURIComponent(String(allParams[k]))}`)
        .join("&");

      const pathWithParams = `${basePath}${config.url}?${queryStringWithoutSig}`;
      const signature = crypto
        .createHmac("sha1", apiKey)
        .update(pathWithParams)
        .digest("hex").toUpperCase();

      config.url = `${config.url}?${queryStringWithoutSig}&signature=${signature}`;
      config.params = undefined;

      return config;
    });
  }
  return client;
}

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

function pickBestStop(
  stops: Array<{ stopId: number; displayName: string; routeType: number[] }>,
  routeType: number
): { stopId: number; displayName: string } | null {
  const matching = stops.filter((s) => s.routeType.includes(routeType));
  if (!matching.length) return null;

  const stationFirst = matching.find((s) =>
    /railway station|station\b/i.test(s.displayName)
  );
  const pick = stationFirst ?? matching[0];

  return { stopId: pick.stopId, displayName: pick.displayName };
}

export async function ptvSearchStops(
  query: string
): Promise<{ position: Coordinate; stopId: number; displayName: string, routeType: number[]}[]> {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];

  const c = getClient();
  const response = await c.get<{
    stops: Array<{ stop_id: number; stop_name: string; stop_latitude: number; stop_longitude: number , route_type?: number}>;
  }>(`/search/${encodeURIComponent(normalized)}`);

  return response.data.stops.map((s) => ({
    stopId: s.stop_id,
    position: { lat: s.stop_latitude, lng: s.stop_longitude },
    displayName: s.stop_name,
    routeType: s.route_type !== undefined ? [s.route_type] : [],
  }));
}

export async function ptvGetDepartures(
  routeType: number,
  stopId: number,
  options?: { limit?: number; includeGeopath?: boolean }
): Promise<PTVDeparture[]> {
  const c = getClient();
  const params: Record<string, string | number> = {
    limit: options?.limit || 10,
  };
  if (options?.includeGeopath) {
    params.include_geopath = "true";
  }

  const response = await c.get<{
    departures: Array<{
      run_ref: string;
      route_id: number;
      route_name: string;
      direction_id: number;
      direction_name: string;
      scheduled_departure_utc: string;
      estimated_departure_utc?: string;
      platform_number?: string;
    }>;
  }>(`/departures/route_type/${routeType}/stop/${stopId}`, { params });

  return response.data.departures.map((d) => ({
    routeId: d.route_id,
    routeName: d.route_name,
    directionId: d.direction_id,
    directionName: d.direction_name,
    scheduledDepartureUtc: d.scheduled_departure_utc,
    estimatedDepartureUtc: d.estimated_departure_utc,
    platformNumber: d.platform_number,
    runRef: d.run_ref,
  }));
}

export async function ptvGetDirections(routeId: number): Promise<PTVDirection[]> {
  const c = getClient();
  const response = await c.get<{ directions: PTVDirection[] }>(`/directions/route/${routeId}`);
  return response.data.directions;
}

export async function ptvGetPatternWithStops(
  routeType: number,
  runRef: string
): Promise<PTvPatternGeometry | null> {
  const c = getClient();
  const response = await c.get<{
    departures: Array<{
      stop_id: number;
      departure_sequence: number;
      run_ref: string;
      route_id: number;
      route_type: number;
    }>;
    stops: Record<string, unknown>;
  }>(`/pattern/run/${runRef}/route_type/${routeType}`, {params: {expand : "stop"}});

  console.log("[PTV expand] stops", JSON.stringify(response.data.stops, null, 2));

  const departures = response.data.departures;
  if (!departures?.length) return null;

  return {
    runRef,
    routeId: departures[0].route_id,
    routeType: departures[0].route_type,
    stops: departures.map((d) => ({
      stopId: d.stop_id,
      stopSequence: d.departure_sequence,
    })),
    geometry: [],
  };
}

export async function ptvFindRouteBetweenStops(
  fromStationName: string,
  toStationName: string,
  routeType: number
): Promise<PTvRouteResult | null> {
  console.log(`[PTV Route] Step 1: Searching origin "${fromStationName}" (routeType=${routeType})`);
  const originStops = await ptvSearchStops(fromStationName);
  console.log(`[PTV Route] Found ${originStops.length} stops for origin`);
  const origin = pickBestStop(originStops, routeType);
  if (!origin) {
    console.log(`[PTV Route] FAIL: No matching stop for origin (routeType=${routeType})`);
    return null;
  }
  console.log(`[PTV Route] Origin: stopId=${origin.stopId} name="${origin.displayName}"`);

  console.log(`[PTV Route] Step 2: Searching destination "${toStationName}"`);
  const destStops = await ptvSearchStops(toStationName);
  console.log(`[PTV Route] Found ${destStops.length} stops for destination`);
  const dest = pickBestStop(destStops, routeType);
  if (!dest) {
    console.log(`[PTV Route] FAIL: No matching stop for destination (routeType=${routeType})`);
    return null;
  }
  console.log(`[PTV Route] Destination: stopId=${dest.stopId} name="${dest.displayName}"`);

  console.log(`[PTV Route] Step 3: Getting departures from origin stopId=${origin.stopId}`);
  const departures = (await ptvGetDepartures(routeType, origin.stopId)).slice(0, 5);
  if (!departures.length) {
    console.log(`[PTV Route] FAIL: No departures from origin stop`);
    return null;
  }
  console.log(`[PTV Route] Got ${departures.length} departures`);

  // Step 4: For each departure, check if destination stop_id is in the pattern
  for (const dep of departures) {
    console.log(`[PTV Route] Step 4: Checking runRef=${dep.runRef}`);
    const pattern = await ptvGetPatternWithStops(routeType, dep.runRef);
    if (!pattern) {
      console.log(`[PTV Route]  No pattern for runRef=${dep.runRef}`);
      continue;
    }
    console.log(`[PTV Route]  Pattern has ${pattern.stops.length} stops`);
    console.log(`[PTV Route]  origin.stopId=${origin.stopId} dest.stopId=${dest.stopId} 
    patternStops=${JSON.stringify(pattern.stops.slice(0, 5).map(s => s.stopId))}`);

    const originIdx = pattern.stops.findIndex((s) => s.stopId === origin.stopId);
    const destIdx = pattern.stops.findIndex((s) => s.stopId === dest.stopId);
    console.log(`[PTV Route]  originIdx=${originIdx} destIdx=${destIdx}`);

    if (originIdx !== -1 && destIdx !== -1 && destIdx > originIdx) {
      const seqDiff = pattern.stops[destIdx].stopSequence - pattern.stops[originIdx].stopSequence;
      const durationSeconds = seqDiff * AVG_DWELL_SECONDS;

      console.log(`[PTV Route] SUCCESS: ${seqDiff} stops, ~${Math.round(durationSeconds/60)}min`);
      return {
        geometry: [],
        durationSeconds,
        platformNumber: dep.platformNumber,
      };
    }
  }

  console.log(`[PTV Route] FAIL: No departure pattern includes destination`);
  return null;
}

export async function ptvFindStopByName(
  name: string,
  routeType = 0
): Promise<{ stopId: number; stopName: string; position: Coordinate } | null> {
  const results = await ptvSearchStops(name);
  if (!results.length) return null;
  const best = pickBestStop(results, routeType);
  if (!best) return null;
  const match = results.find((r) => r.stopId === best.stopId)!;
  return {
    stopId: best.stopId,
    stopName: best.displayName,
    position: match.position,
  };
}
