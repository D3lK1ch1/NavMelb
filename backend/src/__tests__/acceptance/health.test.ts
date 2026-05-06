import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { seedStops } from "../helpers/seed-stops";

describe("GET /health", () => {
  describe("when GTFS data is not loaded", () => {
    const app = createApp();

    it("returns 503 with status degraded", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(503);
      expect(res.body.status).toBe("degraded");
      expect(res.body.timestamp).toBeDefined();
      expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
      expect(res.body.gtfs.stops).toBe(false);
    });
  });

  describe("when GTFS stops are loaded", () => {
    let app: ReturnType<typeof createApp>;

    beforeAll(() => {
      seedStops();
      app = createApp();
    });

    it("returns 200 with status ok and a timestamp", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.timestamp).toBeDefined();
      expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
      expect(res.body.gtfs.stops).toBe(true);
    });
  });
});
