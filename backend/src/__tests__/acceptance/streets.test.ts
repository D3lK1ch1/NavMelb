import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createTestApp } from "../helpers/create-app";

describe("GET /api/map/streets/search", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("returns matching streets for a partial name", async () => {
    const res = await request(app)
      .get("/api/map/streets/search")
      .query({ query: "Flinders" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const first = res.body.data[0];
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("geometry");
    expect(first).toHaveProperty("center");
    expect(first.center).toHaveProperty("lat");
    expect(first.center).toHaveProperty("lng");
    expect(first.name.toLowerCase()).toContain("flinders");
  });

  it("is case-insensitive", async () => {
    const upper = await request(app)
      .get("/api/map/streets/search")
      .query({ query: "BOURKE" });
    const lower = await request(app)
      .get("/api/map/streets/search")
      .query({ query: "bourke" });

    expect(upper.status).toBe(200);
    expect(lower.status).toBe(200);
    expect(upper.body.data.length).toBe(lower.body.data.length);
  });

  it("respects limit parameter", async () => {
    const res = await request(app)
      .get("/api/map/streets/search")
      .query({ query: "street", limit: "3" });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(3);
  });

  it("returns empty array for no matches", async () => {
    const res = await request(app)
      .get("/api/map/streets/search")
      .query({ query: "Nonexistent Boulevard ZZZZZ" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("returns 400 when query is missing", async () => {
    const res = await request(app).get("/api/map/streets/search");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/missing/i);
  });
});

describe("GET /api/map/streets/nearby", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it("returns streets near a CBD coordinate", async () => {
    // Intersection of Flinders & Swanston
    const res = await request(app)
      .get("/api/map/streets/nearby")
      .query({ lat: "-37.8183", lng: "144.9671", radius: "200" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const first = res.body.data[0];
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("distance");
    expect(first.distance).toBeLessThanOrEqual(200);
  });

  it("returns empty array when nothing is nearby", async () => {
    // Middle of Port Phillip Bay — no streets here
    const res = await request(app)
      .get("/api/map/streets/nearby")
      .query({ lat: "-37.88", lng: "144.90", radius: "10" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("returns 400 when lat/lng is missing", async () => {
    const res = await request(app)
      .get("/api/map/streets/nearby")
      .query({ lat: "-37.8183" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
