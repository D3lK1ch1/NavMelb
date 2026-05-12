/**
 * Fuzz tests — GET /api/map/destination/lookup
 *
 * Invariant: no input produces a 500 response.
 * 400 / 404 = validation or "not found" (expected).
 * 500 = crash in application code (bug).
 */

import { describe, beforeAll, afterEach, expect, vi } from "vitest";
import { test as fcTest, fc } from "@fast-check/vitest";
import request from "supertest";
import type { Express } from "express";
import { createTestApp } from "../helpers/create-app";
import { withCaptureSink } from "./sinks/capture-sink";

// ---------------------------------------------------------------------------
// Mocks — keep external services deterministic
// ---------------------------------------------------------------------------

vi.mock("../../services/geocoding.service", () => ({
  geocodeAddress: vi.fn(async (_query: string) => null),
}));

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const arbNastyString = fc.oneof(
  fc.string(),
  fc.constant(""),
  fc.constant("null"),
  fc.constant("undefined"),
  fc.constant("-1"),
  fc.constant("0"),
  fc.constant("99999999999999999"),
  fc.constant("'; DROP TABLE users; --"),
  fc.constant("<script>alert(1)</script>"),
  fc.constant("../../../etc/passwd"),
  fc.constant("%00"),
  fc.constant("a".repeat(10000)),
);

// ---------------------------------------------------------------------------

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fuzz: GET /api/map/destination/lookup", () => {
  fcTest.prop([arbNastyString], { numRuns: 75 })(
    "never returns 500 for any query string",
    async (query) => {
      const { teardown } = withCaptureSink("destination-lookup");
      try {
        const res = await request(app)
          .get("/api/map/destination/lookup")
          .query({ query });

        expect(res.status).not.toBe(500);
        expect(res.body).toHaveProperty("success");
        // Must always have timestamp
        expect(res.body).toHaveProperty("timestamp");
      } finally {
        teardown();
      }
    },
  );

  fcTest.prop([fc.string({ minLength: 1 })], { numRuns: 50 })(
    "non-empty query always returns 200 or 404 (not 400/500)",
    async (query) => {
      const { teardown } = withCaptureSink("destination-lookup-nonempty");
      try {
        const res = await request(app)
          .get("/api/map/destination/lookup")
          .query({ query });

        expect([200, 404]).toContain(res.status);
      } finally {
        teardown();
      }
    },
  );
});
