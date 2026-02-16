// Real data will be integrated in production

import { Coordinate } from "../types";

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


//Mock place lookup - returns lat/long for common Melbourne locations
// In production, this will query a geocoding API or database - Trying to find a database fitting all of Melb
export function lookupDestination(query: string): Coordinate | null {
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
