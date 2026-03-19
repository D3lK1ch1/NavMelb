import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createTestApp } from "../helpers/create-app";

describe("GET /api/map/stations/search", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("returns matching stations for 'flinders'", async () => {
    const res = await request(app)
      .get("/api/map/stations/search")
      .query({ query: "flinders" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const first = res.body.data[0];
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("position");
    expect(first).toHaveProperty("transportTypes");
    expect(first.position).toHaveProperty("lat");
    expect(first.position).toHaveProperty("lng");
  });

  it("filters results by transportType=train", async () => {
    const res = await request(app)
      .get("/api/map/stations/search")
      .query({ query: "flinders", transportType: "train" });

    expect(res.status).toBe(200);
    for (const stop of res.body.data) {
      expect(stop.transportTypes).toContain("train");
    }
  });

  it("filters results by transportType=tram", async () => {
    const res = await request(app)
      .get("/api/map/stations/search")
      .query({ query: "flinders", transportType: "tram" });

    expect(res.status).toBe(200);
    // The tram fixture has "Federation Square/Flinders St" which normalizes to include "flinders"
    // All results should include tram
    for (const stop of res.body.data) {
      expect(stop.transportTypes).toContain("tram");
    }
  });

  it("respects limit parameter", async () => {
    const res = await request(app)
      .get("/api/map/stations/search")
      .query({ query: "flinders", limit: "1" });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
  });

  it("matches 'Flinders Street Station' (normalization strips 'station')", async () => {
    const res = await request(app)
      .get("/api/map/stations/search")
      .query({ query: "Flinders Street Station" });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("returns 400 when query is missing", async () => {
    const res = await request(app).get("/api/map/stations/search");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/missing/i);
  });
});
