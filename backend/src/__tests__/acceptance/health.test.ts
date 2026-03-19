import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app";

describe("GET /health", () => {
  const app = createApp();

  it("returns 200 with status ok and a timestamp", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.timestamp).toBeDefined();
    expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
  });
});
