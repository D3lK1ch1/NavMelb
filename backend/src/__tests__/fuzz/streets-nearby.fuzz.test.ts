/**
 * Fuzz tests — GET /api/map/streets/nearby
 *
 * Invariant: no input produces a 500 response.
 * Exercises numeric parsing of lat/lng/radius/limit query params,
 * out-of-range coordinates, NaN propagation into Haversine-based distance,
 * and the limit=0 / negative-limit edge cases.
 */

import { describe, beforeAll, afterEach, expect, vi } from "vitest";
import { test as fcTest, fc } from "@fast-check/vitest";
import request from "supertest";
import type { Express } from "express";
import { createTestApp } from "../helpers/create-app";
import { withCaptureSink } from "./sinks/capture-sink";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Any string that could be passed as a numeric query param. */
const arbNumericish = fc.oneof(
  fc.double({ noNaN: true }).map(String),
  fc.constant("NaN"),
  fc.constant("Infinity"),
  fc.constant("-Infinity"),
  fc.constant(""),
  fc.constant("banana"),
  fc.constant("null"),
  fc.constant("undefined"),
  fc.constant("0"),
  fc.constant("-1"),
  fc.constant("99999999999"),
  fc.constant("1e308"),
  fc.constant("-1e308"),
);

/** Valid lat/lng strings for the happy path. */
const arbValidLat = fc.double({ min: -90, max: 90, noNaN: true }).map(String);
const arbValidLng = fc.double({ min: -180, max: 180, noNaN: true }).map(String);

const arbRadius = fc.oneof(
  fc.integer({ min: 0, max: 100000 }).map(String),
  fc.constant("0"),
  fc.constant("-1"),
  fc.constant("NaN"),
  fc.constant("Infinity"),
  fc.constant("banana"),
);

const arbLimitStr = fc.oneof(
  fc.integer({ min: -10, max: 10000 }).map(String),
  fc.constant("0"),
  fc.constant("-5"),
  fc.constant("NaN"),
  fc.constant("Infinity"),
  fc.constant("banana"),
);

// ---------------------------------------------------------------------------

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fuzz: GET /api/map/streets/nearby", () => {
  fcTest.prop([arbNumericish, arbNumericish], { numRuns: 100 })(
    "never returns 500 for any lat/lng string",
    async (lat, lng) => {
      const { teardown } = withCaptureSink("streets-nearby-coords");
      try {
        const res = await request(app)
          .get("/api/map/streets/nearby")
          .query({ lat, lng });

        expect(res.status).not.toBe(500);
        expect(res.body).toHaveProperty("success");
      } finally {
        teardown();
      }
    },
  );

  fcTest.prop([arbValidLat, arbValidLng, arbRadius, arbLimitStr], { numRuns: 75 })(
    "valid coords with any radius/limit never returns 500",
    async (lat, lng, radius, limit) => {
      const { teardown } = withCaptureSink("streets-nearby-all");
      try {
        const res = await request(app)
          .get("/api/map/streets/nearby")
          .query({ lat, lng, radius, limit });

        expect(res.status).not.toBe(500);
        if (res.status === 200) {
          expect(Array.isArray(res.body.data)).toBe(true);
        }
      } finally {
        teardown();
      }
    },
  );
});
