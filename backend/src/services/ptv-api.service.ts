import axios, { AxiosInstance } from "axios";
import crypto from "node:crypto";
import { dispatch } from "../events/dispatch";

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
const AVG_DWELL_SECONDS = 210;

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

function isLonLatPair(value: unknown): value is [number, number] {
  return Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number";
}

function flattenLonLatPairs(value: unknown): Array<[number, number]> {
  if (isLonLatPair(value)) {
    return [[value[0], value[1]]];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => flattenLonLatPairs(item));
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
    geopath?: Array<{
      geometry?: {
        type?: string;
        coordinates?: unknown;
      };
    }>;
  }>(`/pattern/run/${runRef}/route_type/${routeType}`, { params: { include_geopath: "true" } });

  const departures = response.data.departures;
  if (!departures?.length) return null;

  const geopathEntry = response.data.geopath?.find((g) => flattenLonLatPairs(g.geometry?.coordinates).length > 0);
  const geometry: number[][] = flattenLonLatPairs(geopathEntry?.geometry?.coordinates)
    .map(([lng, lat]) => [lat, lng]) // GeoJSON [lng,lat] → Leaflet [lat,lng]

  ;

  return {
    runRef,
    routeId: departures[0].route_id,
    routeType: departures[0].route_type,
    stops: departures.map((d) => ({
      stopId: d.stop_id,
      stopSequence: d.departure_sequence,
    })),
    geometry,
  };
}

export async function ptvFindRouteBetweenStops(
  fromStationName: string,
  toStationName: string,
  routeType: number
): Promise<PTvRouteResult | null> {
  const originStops = await ptvSearchStops(fromStationName);
  const origin = pickBestStop(originStops, routeType);
  if (!origin) {
    dispatch({ type: "ptv.route.origin_not_found", query: fromStationName, routeType });
    return null;
  }
  dispatch({ type: "ptv.route.origin_found", stopId: origin.stopId, displayName: origin.displayName });

  const destStops = await ptvSearchStops(toStationName);
  const dest = pickBestStop(destStops, routeType);
  if (!dest) {
    dispatch({ type: "ptv.route.destination_not_found", query: toStationName, routeType });
    return null;
  }
  dispatch({ type: "ptv.route.destination_found", stopId: dest.stopId, displayName: dest.displayName });

  const departures = (await ptvGetDepartures(routeType, origin.stopId, { limit: 20 }));
  if (!departures.length) {
    dispatch({ type: "ptv.route.no_departures", stopId: origin.stopId });
    return null;
  }

  // For each departure, check if destination stop_id is in the pattern
  for (const dep of departures) {
    const pattern = await ptvGetPatternWithStops(routeType, dep.runRef);
    if (!pattern) continue;

    const originIdx = pattern.stops.findIndex((s) => s.stopId === origin.stopId);
    const destIdx = pattern.stops.findIndex((s) => s.stopId === dest.stopId);

    if (originIdx !== -1 && destIdx !== -1 && destIdx > originIdx) {
      const seqDiff = pattern.stops[destIdx].stopSequence - pattern.stops[originIdx].stopSequence;
      const durationSeconds = seqDiff * AVG_DWELL_SECONDS;
      dispatch({ type: "ptv.route.success", from: fromStationName, to: toStationName, stops: seqDiff, durationSeconds });
      return {
        geometry: pattern.geometry,
        durationSeconds,
        platformNumber: dep.platformNumber,
      };
    }
  }

  dispatch({ type: "ptv.route.no_matching_pattern", from: fromStationName, to: toStationName });
  return null;
}

export async function ptvGetRouteNamesForStop(stopId: number, routeType: number): Promise<string[]> {
  try {
    const c = getClient();
    const response = await c.get<{
      stop: {
        routes?: Array<{ route_number?: string; route_name?: string }>;
      };
    }>(`/stops/${stopId}/route_type/${routeType}`);

    const routes = response.data.stop?.routes ?? [];
    return routes
      .map((r) => r.route_number?.trim() || r.route_name?.trim() || "")
      .filter(Boolean)
      .slice(0, 3) as string[];
  } catch {
    return [];
  }
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
