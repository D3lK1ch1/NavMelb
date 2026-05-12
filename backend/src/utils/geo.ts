import { Coordinate } from "../types";

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceMeters(coord1: Coordinate, coord2: Coordinate): number {
  // Clamp to valid geographic ranges to prevent Infinity/NaN from extreme doubles
  const lat1 = Math.max(-90, Math.min(90, coord1.lat));
  const lng1 = Math.max(-180, Math.min(180, coord1.lng));
  const lat2 = Math.max(-90, Math.min(90, coord2.lat));
  const lng2 = Math.max(-180, Math.min(180, coord2.lng));

  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const result = R * c;
  return isFinite(result) ? result : 0;
}
