import axios from "axios";
import { RouteSegment, Coordinate } from "../types";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});


export async function lookupDestination(query: string) {
  try {
    const response = await api.get("/destination/lookup", {
      params: { query },
    });
    return response.data;
  } catch (error) {
    console.error(`Failed to lookup destination "${query}":`, error);
    throw error;
  }
}

export async function calculateDistance(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  try {
    const response = await api.post("/distance", { from, to });
    return response.data;
  } catch (error) {
    console.error("Failed to calculate distance:", error);
    throw error;
  }
}

export async function searchStations(query: string, limit?: number) {
  try {
    const response = await api.get("/stations/search", {
      params: { query, limit },
    });
    return response.data;
  } catch (error) {
    console.error(`Failed to search stations "${query}":`, error);
    throw error;
  }
}

export async function calculateRoute(
  from: Coordinate,
  to: Coordinate,
  routeType: "car" | "train",
  viaStations?: Coordinate[]
) {
  try {
    const response = await api.post("/route/calculate", {
      from,
      to,
      routeType,
      viaStations,
    });
    return response.data;
  } catch (error) {
    console.error("Failed to calculate route:", error);
    throw error;
  }
}
