import fs from "fs";
import path from "path";
import { Coordinate } from "../types";
import { distanceMeters } from "../utils/geo";

interface StreetFeature {
  name: string;
  displayName: string;
  center: Coordinate;
  geometry: number[][];
}

let streets: StreetFeature[] = [];

/**
 * Load street names GeoJSON from disk.
 * Call once at startup. Expects a standard GeoJSON FeatureCollection with LineString features.
 */
export function loadStreetData(filePath?: string): void {
  const resolved = filePath || path.resolve(__dirname, "../../data/street-names.geojson");

  if (!fs.existsSync(resolved)) {
    console.warn(`Street data not found at ${resolved}, street search will be empty.`);
    streets = [];
    return;
  }

  const geojson = JSON.parse(fs.readFileSync(resolved, "utf8"));

  streets = geojson.features.map((f: {
    properties: { name?: string; maplabel?: string; geo_point_2d?: { lat: number; lon: number } };
    geometry: { coordinates: number[][] };
  }) => {
    const coords = f.geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
    const center = f.properties.geo_point_2d
      ? { lat: f.properties.geo_point_2d.lat, lng: f.properties.geo_point_2d.lon }
      : { lat: coords[0][0], lng: coords[0][1] };

    return {
      name: (f.properties.name || "").toLowerCase().trim(),
      displayName: f.properties.maplabel || f.properties.name || "",
      center,
      geometry: coords,
    };
  });

  console.log(`[Streets] Loaded ${streets.length} street centrelines`);
}

/** Search streets by partial name match. */
export function searchStreets(query: string, limit = 20): {
  name: string;
  center: Coordinate;
  geometry: number[][];
}[] {
  const normalized = query.toLowerCase().trim();
  return streets
    .filter((s) => s.name.includes(normalized))
    .slice(0, limit)
    .map((s) => ({
      name: s.displayName,
      center: s.center,
      geometry: s.geometry,
    }));
}

/** Find streets whose centre point is within `radiusMeters` of a coordinate. */
export function nearbyStreets(point: Coordinate, radiusMeters = 200, limit = 20): {
  name: string;
  center: Coordinate;
  geometry: number[][];
  distance: number;
}[] {
  return streets
    .map((s) => ({ ...s, distance: Math.round(distanceMeters(point, s.center)) }))
    .filter((s) => s.distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((s) => ({
      name: s.displayName,
      center: s.center,
      geometry: s.geometry,
      distance: s.distance,
    }));
}
