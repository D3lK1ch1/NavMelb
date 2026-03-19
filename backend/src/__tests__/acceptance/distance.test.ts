import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app";

describe("POST /api/map/distance", () => {
  const app = createApp();

  it("returns distance in meters and km for two Melbourne coordinates", async () => {
    const res = await request(app)
      .post("/api/map/distance")
      .send({
        from: { lat: -37.8136, lng: 144.9631 }, // Melbourne CBD
        to: { lat: -37.8676, lng: 144.9811 },   // St Kilda
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.distance).toBeGreaterThan(4000);
    expect(res.body.data.distance).toBeLessThan(7000);
    expect(res.body.data.distanceKm).toBeGreaterThan(4);
    expect(res.body.data.unit).toBe("meters");
  });

  it("returns zero distance for identical coordinates", async () => {
    const coord = { lat: -37.8136, lng: 144.9631 };
    const res = await request(app)
      .post("/api/map/distance")
      .send({ from: coord, to: coord });

    expect(res.status).toBe(200);
    expect(res.body.data.distance).toBe(0);
    expect(res.body.data.distanceKm).toBe(0);
  });

  it("returns 400 when coordinates are missing", async () => {
    const res = await request(app)
      .post("/api/map/distance")
      .send({ from: { lat: -37.8136 } });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
