import axios from "axios";

//APIs change based on wi-fi reconnections and reboots. Keep checking ipconfig etc for this.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://10.109.18.1:8081/api/map";

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
