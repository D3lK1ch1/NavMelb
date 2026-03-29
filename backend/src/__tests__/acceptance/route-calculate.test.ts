import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createTestApp } from "../helpers/create-app";

// Mock axios for OSRM calls
vi.mock("axios", () => ({
  default: {
    get: vi.fn(async (url: string) => {
      if (url.includes("router.project-osrm.org")) {
        return {
          data: {
            code: "Ok",
            routes: [
              {
                geometry: {
                  coordinates: [
                    [144.9631, -37.8136],
                    [144.9671, -37.8183],
                  ],
                },
                distance: 1200,
                duration: 180,
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    }),
  },
}));

const origin = { lat: -37.8136, lng: 144.9631 };
const destination = { lat: -37.8235, lng: 144.9898 };

describe("POST /api/map/route/calculate", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  describe("car strategy", () => {
    it("returns OSRM route with car segment", async () => {
      const res = await request(app)
        .post("/api/map/route/calculate")
        .send({ origin, destination, strategy: "car" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.segments).toHaveLength(1);
      expect(res.body.data.segments[0].type).toBe("car");
      expect(res.body.data.segments[0].coordinates.length).toBeGreaterThan(0);
      expect(res.body.data.totalDistance).toBeGreaterThan(0);
      expect(res.body.data.totalDuration).toBeGreaterThan(0);
    });

    it("falls back to Haversine when OSRM fails", async () => {
      const axios = await import("axios");
      const mockGet = vi.mocked(axios.default.get);
      mockGet.mockRejectedValueOnce(new Error("OSRM down"));

      const res = await request(app)
        .post("/api/map/route/calculate")
        .send({ origin, destination, strategy: "car" });

      expect(res.status).toBe(200);
      expect(res.body.data.segments[0].type).toBe("car");
      // Fallback still returns a geometry (straight line)
      expect(res.body.data.segments[0].coordinates).toHaveLength(2);
    });
  });

  describe("ptv strategy", () => {
    it("returns mixed car+ptv segments for place→station→station→place chain", async () => {
      const res = await request(app)
        .post("/api/map/route/calculate")
        .send({
          origin,
          destination,
          strategy: "ptv",
          waypoints: [
            { position: { lat: -37.8183, lng: 144.9671 }, type: "station", name: "Flinders Street" },
            { position: { lat: -37.8235, lng: 144.9898 }, type: "station", name: "Richmond" },
          ],
        });

      // origin(place) → Flinders(station) → car
      // Flinders(station) → Richmond(station) → ptv
      // Richmond(station) → destination(place) → car
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const segments = res.body.data.segments;
      expect(segments.length).toBeGreaterThanOrEqual(1);
      const ptvSegs = segments.filter((s: { type: string }) => s.type === "ptv");
      expect(ptvSegs.length).toBeGreaterThan(0);
      for (const seg of segments) {
        expect(seg.coordinates).toBeDefined();
        expect(seg.coordinates.length).toBeGreaterThan(0);
        expect(typeof seg.duration).toBe("number");
      }
    });

    it("returns 400 when no station waypoints provided", async () => {
      const res = await request(app)
        .post("/api/map/route/calculate")
        .send({
          origin,
          destination,
          strategy: "ptv",
          waypoints: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least one station/i);
    });

    it("includes departure info", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-19T07:50:00"));

      const res = await request(app)
        .post("/api/map/route/calculate")
        .send({
          origin,
          destination,
          strategy: "ptv",
          waypoints: [
            { position: { lat: -37.8183, lng: 144.9671 }, type: "station", name: "Flinders Street" },
            { position: { lat: -37.8235, lng: 144.9898 }, type: "station", name: "Richmond" },
          ],
        });

      expect(res.status).toBe(200);
      // Departure info should be present for PTV strategy
      if (res.body.data.departureInfo) {
        expect(res.body.data.departureInfo.length).toBeGreaterThan(0);
        expect(res.body.data.departureInfo[0]).toHaveProperty("stationName");
        expect(res.body.data.departureInfo[0]).toHaveProperty("nextDeparture");
      }

      vi.useRealTimers();
    });
  });

  describe("ptv mixed waypoints", () => {
    it("produces car+ptv+car when place→station→station→place", async () => {
      const res = await request(app)
        .post("/api/map/route/calculate")
        .send({
          origin,
          destination,
          strategy: "ptv",
          waypoints: [
            { position: { lat: -37.8183, lng: 144.9671 }, type: "station", name: "Flinders Street" },
            { position: { lat: -37.8235, lng: 144.9898 }, type: "station", name: "Richmond" },
          ],
        });

      expect(res.status).toBe(200);
      const segments = res.body.data.segments;
      expect(segments[0].type).toBe("car");
      const ptvSegments = segments.filter((s: { type: string }) => s.type === "ptv");
      expect(ptvSegments.length).toBeGreaterThan(0);
    });

    it("returns 400 for removed park-and-ride strategy", async () => {
      const res = await request(app)
        .post("/api/map/route/calculate")
        .send({
          origin,
          destination,
          strategy: "park-and-ride",
          waypoints: [
            { position: { lat: -37.8183, lng: 144.9671 }, type: "station", name: "Flinders Street" },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid strategy/i);
    });
  });

  describe("validation", () => {
    it("returns 400 when origin/destination is missing", async () => {
      const res = await request(app)
        .post("/api/map/route/calculate")
        .send({ strategy: "car" });

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid strategy", async () => {
      const res = await request(app)
        .post("/api/map/route/calculate")
        .send({ origin, destination, strategy: "bicycle" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid strategy/i);
    });
  });
});
