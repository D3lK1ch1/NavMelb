// Phase 1: Foundation Map - Mock Traffic Light Data
// Real data will be integrated in production

import { TrafficLight, Coordinate } from "../types";

// Melbourne CBD intersections with traffic light data
const MELBOURNE_TRAFFIC_LIGHTS: TrafficLight[] = [
  // Princes Street & City Road
  {
    id: "tl_001",
    position: { lat: -37.8100, lng: 144.9633 },
    state: "red",
    road: "Princes Street",
    direction: "North-South",
  },
  // Princes Street & Spring Street
  {
    id: "tl_002",
    position: { lat: -37.8103, lng: 144.9728 },
    state: "green",
    road: "Princes Street",
    direction: "North-South",
  },
  // Flinders Street & Elizabeth Street
  {
    id: "tl_003",
    position: { lat: -37.8158, lng: 144.9670 },
    state: "amber",
    road: "Flinders Street",
    direction: "East-West",
  },
  // Collins Street & Queen Street
  {
    id: "tl_004",
    position: { lat: -37.8137, lng: 144.9659 },
    state: "green",
    road: "Collins Street",
    direction: "East-West",
  },
  // Bourke Street & Swanston Street
  {
    id: "tl_005",
    position: { lat: -37.8133, lng: 144.9648 },
    state: "red",
    road: "Bourke Street",
    direction: "East-West",
  },
  // Add more intersections as needed
];

/**
 * Get all traffic lights in view bounds
 */
export function getTrafficLightsByBounds(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number
): TrafficLight[] {
  return MELBOURNE_TRAFFIC_LIGHTS.filter((light) => {
    return (
      light.position.lat >= minLat &&
      light.position.lat <= maxLat &&
      light.position.lng >= minLng &&
      light.position.lng <= maxLng
    );
  });
}

/**
 * Get all traffic lights (MVP - mock data only)
 */
export function getAllTrafficLights(): TrafficLight[] {
  return MELBOURNE_TRAFFIC_LIGHTS;
}

/**
 * Simulate state change for demo/testing
 */
export function simulateTrafficStateChange(): void {
  MELBOURNE_TRAFFIC_LIGHTS.forEach((light) => {
    const states: Array<"red" | "amber" | "green"> = ["red", "amber", "green"];
    light.state = states[Math.floor(Math.random() * states.length)];
  });
}

/**
 * Get distance between two coordinates using Haversine formula
 */
export function calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) *
      Math.cos(toRad(coord2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000; // Return in meters
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Mock place lookup - returns lat/long for common Melbourne locations
 */
export function lookupPlace(query: string): Coordinate | null {
  const places: Record<string, Coordinate> = {
    "melbourne cbd": { lat: -37.8136, lng: 144.9631 },
    "southern cross": { lat: -37.8184, lng: 144.9527 },
    "flinders street": { lat: -37.8158, lng: 144.9670 },
    "parliament": { lat: -37.8100, lng: 144.9715 },
    "princess theatre": { lat: -37.8147, lng: 144.9636 },
    "shrine of remembrance": { lat: -37.8300, lng: 144.9817 },
    "federation square": { lat: -37.8196, lng: 144.9732 },
  };

  const normalized = query.toLowerCase().trim();
  return places[normalized] || null;
}
