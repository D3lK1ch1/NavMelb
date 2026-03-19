import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createTestApp } from "../helpers/create-app";

vi.mock("../../services/geocoding.service", () => ({
  geocodeAddress: vi.fn(async (query: string) => {
    if (query.toLowerCase().includes("federation square")) {
      return { lat: -37.818, lng: 144.969 };
    }
    return null;
  }),
}));

describe("GET /api/map/destination/lookup", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("returns coordinates for a known GTFS stop", async () => {
    const res = await request(app)
      .get("/api/map/destination/lookup")
      .query({ query: "Richmond" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("lat");
    expect(res.body.data).toHaveProperty("lng");
  });

  it("falls through to Nominatim for unknown places", async () => {
    const res = await request(app)
      .get("/api/map/destination/lookup")
      .query({ query: "Federation Square" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.lat).toBeCloseTo(-37.818, 2);
  });

  it("returns 404 when place is not found anywhere", async () => {
    const res = await request(app)
      .get("/api/map/destination/lookup")
      .query({ query: "Nonexistent Place XYZ123" });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 when query param is missing", async () => {
    const res = await request(app).get("/api/map/destination/lookup");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/missing/i);
  });
});
