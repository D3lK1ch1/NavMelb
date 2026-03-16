import axios from "axios";
import { Coordinate } from "../types";

type Cached<T> = { value: T; expiresAtMs: number };

const baseUrl = "https://nominatim.openstreetmap.org";
const cacheTtlMs = 1000 * 60 * 60 * 24;
const geocodeCache = new Map<string, Cached<Coordinate | null>>();

let nextAllowedRequestAtMs = 0;
async function throttle(): Promise<void> {
  const now = Date.now();
  const waitMs = Math.max(0, nextAllowedRequestAtMs - now);
  nextAllowedRequestAtMs = Math.max(nextAllowedRequestAtMs, now) + 1100;
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

function getUserAgent(): string {
  return process.env.NOMINATIM_USER_AGENT || "NavMelb/1.0 (local dev)";
}

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

export async function geocodeAddress(query: string): Promise<Coordinate | null> {
  const normalized = normalizeQuery(query);
  if (!normalized) return null;

  const cached = geocodeCache.get(normalized);
  if (cached && cached.expiresAtMs > Date.now()) return cached.value;

  await throttle();

  try {
    const response = await axios.get(`${baseUrl}/search`, {
      params: {
        q: query,
        format: "json",
        addressdetails: 0,
        limit: 1,
      },
      headers: {
        "User-Agent": getUserAgent(),
        "Accept-Language": "en",
      },
      timeout: 10000,
    });

    const first = Array.isArray(response.data) ? response.data[0] : null;
    const lat = first?.lat ? Number(first.lat) : NaN;
    const lng = first?.lon ? Number(first.lon) : NaN;
    const value = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    geocodeCache.set(normalized, { value, expiresAtMs: Date.now() + cacheTtlMs });
    return value;
  } catch (error) {
    geocodeCache.set(normalized, { value: null, expiresAtMs: Date.now() + 60_000 });
    return null;
  }
}

