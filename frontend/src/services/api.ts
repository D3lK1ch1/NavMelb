import axios from "axios";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

/**
 * Phase 1: Get all traffic lights
 */
export async function fetchTrafficLights() {
  try {
    const response = await api.get("/phase1/traffic-lights");
    return response.data;
  } catch (error) {
    console.error("Failed to fetch traffic lights:", error);
    throw error;
  }
}

/**
 * Phase 1: Get traffic lights within view bounds
 */
export async function fetchTrafficLightsByBounds(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number
) {
  try {
    const response = await api.get("/phase1/traffic-lights/bounds", {
      params: { minLat, maxLat, minLng, maxLng },
    });
    return response.data;
  } catch (error) {
    console.error("Failed to fetch traffic lights by bounds:", error);
    throw error;
  }
}

/**
 * Phase 1: Lookup place by name
 */
export async function lookupPlace(query: string) {
  try {
    const response = await api.get("/phase1/place/lookup", {
      params: { query },
    });
    return response.data;
  } catch (error) {
    console.error(`Failed to lookup place "${query}":`, error);
    throw error;
  }
}

/**
 * Phase 1: Calculate distance between two coordinates
 */
export async function calculateDistance(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  try {
    const response = await api.post("/phase1/distance", { from, to });
    return response.data;
  } catch (error) {
    console.error("Failed to calculate distance:", error);
    throw error;
  }
}
