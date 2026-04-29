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
  geometry: number[][];
}

const baseUrl = "https://timetableapi.ptv.vic.gov.au/v3";

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
      timeout: 10000,
    });

    client.interceptors.request.use((config) => {
      const url = new URL(config.url || "", baseUrl);
      const params = new URLSearchParams(url.search);
      params.set("devid", devId);
      const basePath = new URL(baseUrl).pathname; // "/v3"
      const pathWithParams = `${basePath}${config.url}?${params.toString()}`;
      const signature = crypto
        .createHmac("sha1", apiKey)
        .update(pathWithParams)
        .digest("hex").toUpperCase();
      config.params = { ...config.params, signature };
      return config;
    });
  }
  return client;
}

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

export async function ptvSearchStops(
  query: string
): Promise<{ position: Coordinate; stopId: number; displayName: string, routeTypes: number[]}[]> {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];

  const c = getClient();
  const response = await c.get<{
    stops: Array<{ stop_id: number; stop_name: string; stop_lat: number; stop_lng: number , route_types?: number[]}>;
  }>(`/search/${encodeURIComponent(normalized)}`);

  return response.data.stops.map((s) => ({
    stopId: s.stop_id,
    position: { lat: s.stop_lat, lng: s.stop_lng },
    displayName: s.stop_name,
    routeTypes: s.route_types ?? [],
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

export async function ptvGetPatternGeometry(
  routeType: number,
  runRef: string
): Promise<PTvPatternGeometry | null> {
  const c = getClient();
  const response = await c.get<{
    patterns: Array<{
      run_ref: string;
      route_id: number;
      route_type: number;
      geopath: Array<{ lat: number; lon: number }>;
    }>;
  }>(`/pattern`, {
    params: { run_ref: runRef, include_geopath: "true" },
  });

  const pattern = response.data.patterns?.[0];
  if (!pattern) return null;

return {
    runRef: pattern.run_ref,
    routeId: pattern.route_id,
    routeType: pattern.route_type,
    geometry: pattern.geopath.map((p) => [p.lat, p.lon]),
  };
}

export async function ptvFindStopByName(
  name: string
): Promise<{ stopId: number; stopName: string; position: Coordinate } | null> {
  const results = await ptvSearchStops(name);
  if (!results.length) return null;
  return {
    stopId: results[0].stopId,
    stopName: results[0].displayName,
    position: results[0].position,
  };
}