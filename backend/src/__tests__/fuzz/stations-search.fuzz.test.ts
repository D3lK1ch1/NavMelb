/**
 * Fuzz tests — GET /api/map/stations/search
 *
 * Invariant: no input produces a 500 response.
 * PTV is mocked. The fuzz exercises: nasty query strings, pathological limit values,
 * every known transportType value plus unknown ones.
 */

import { describe, beforeAll, afterEach, expect, vi } from "vitest";
import { test as fcTest, fc } from "@fast-check/vitest";
import request from "supertest";
import type { Express } from "express";
import { createTestApp } from "../helpers/create-app";
import { withCaptureSink } from "./sinks/capture-sink";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../services/ptv-api.service", () => ({
  ptvSearchStops: vi.fn(async () => [
    {
      displayName: "Flinders Street Station",
      position: { lat: -37.8183, lng: 144.9671 },
      routeType: [0],
    },
  ]),
  ptvGetDepartures: vi.fn(async () => []),
  ptvFindStopByName: vi.fn(async () => null),
  ptvFindRouteBetweenStops: vi.fn(async () => null),
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

const arbLimit = fc.oneof(
  fc.integer({ min: -100, max: 10000 }).map(String),
  fc.constant(""),
  fc.constant("NaN"),
  fc.constant("Infinity"),
  fc.constant("-Infinity"),
  fc.constant("banana"),
  fc.constant("0"),
  fc.constant("999999999"),
);

const arbTransportType = fc.oneof(
  fc.constant("train"),
  fc.constant("tram"),
  fc.constant("bus"),
  fc.constant("ferry"),
  fc.constant("hovercraft"),
  fc.constant(""),
  fc.constant("undefined"),
  fc.constant("'; DROP TABLE--"),
  fc.string(),
);

// ---------------------------------------------------------------------------

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fuzz: GET /api/map/stations/search", () => {
  fcTest.prop([arbNastyString], { numRuns: 75 })(
    "never returns 500 for any query value",
    async (query) => {
      const { teardown } = withCaptureSink("stations-search-query");
      try {
        const res = await request(app)
          .get("/api/map/stations/search")
          .query({ query });

        expect(res.status).not.toBe(500);
        expect(res.body).toHaveProperty("success");
      } finally {
        teardown();
      }
    },
  );

  fcTest.prop([fc.string({ minLength: 1 }), arbLimit, arbTransportType], { numRuns: 75 })(
    "never returns 500 for any combination of query, limit, transportType",
    async (query, limit, transportType) => {
      const { teardown } = withCaptureSink("stations-search-combo");
      try {
        const res = await request(app)
          .get("/api/map/stations/search")
          .query({ query, limit, transportType });

        expect(res.status).not.toBe(500);
      } finally {
        teardown();
      }
    },
  );
});
