import { Coordinate } from "../types";
import { findStopCoordinate } from "./gtfs-stop-indexservice";

export function calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
  const R = 6371;
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) *
      Math.cos(toRad(coord2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function lookupDestination(query: string): Coordinate | null {
  return findStopCoordinate(query);
}
