/**
 * Fuzz tests — POST /api/map/route/calculate
 *
 * Invariant: no input produces a 500 response.
 * This is the most complex endpoint: it orchestrates OSRM + PTV, processes
 * waypoint arrays, parses departure times, and mutates time state in a loop.
 * Bugs here tend to be: NaN time arithmetic, undefined.split(), slice on null,
 * or unbounded loops from malformed waypoint arrays.
 */

import { describe, beforeAll, afterEach, it, expect, vi } from "vitest";
import { test as fcTest, fc } from "@fast-check/vitest";
import request from "supertest";
import type { Express } from "express";
import { createTestApp } from "../helpers/create-app";
import { withCaptureSink } from "./sinks/capture-sink";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../services/ptv-api.service", () => ({
  ptvSearchStops: vi.fn(async () => []),
  ptvGetDepartures: vi.fn(async () => []),
  ptvFindStopByName: vi.fn(async () => null),
  ptvFindRouteBetweenStops: vi.fn(async () => null),
}));

vi.mock("axios", () => ({
  default: {
    get: vi.fn(async (url: string) => {
      if (url.includes("router.project-osrm.org") || url.includes("localhost:5000")) {
        return {
          data: {
            code: "Ok",
            routes: [
              {
                geometry: { coordinates: [[144.9631, -37.8136], [144.9671, -37.8183]] },
                distance: 1200,
                duration: 180,
              },
            ],
          },
        };
      }
      if (url.includes("nominatim.openstreetmap.org")) {
        return { data: [] };
      }
      throw new Error(`Unexpected URL: ${url}`);
    }),
  },
}));

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const arbCoordinate = fc.record({
  lat: fc.oneof(fc.double({ min: -90, max: 90, noNaN: true }), fc.double({ noNaN: true }), fc.constant(0)),
  lng: fc.oneof(fc.double({ min: -180, max: 180, noNaN: true }), fc.double({ noNaN: true }), fc.constant(0)),
});

const arbMaybeCoordinate = fc.oneof(
  arbCoordinate,
  fc.constant(null),
  fc.constant(undefined),
  fc.constant({}),
  fc.constant({ lat: "banana", lng: "apple" }),
);

const arbStrategy = fc.oneof(
  fc.constant("car"),
  fc.constant("ptv"),
  fc.constant("walk"),
  fc.constant(""),
  fc.constant("null"),
  fc.constant(null),
  fc.constant(undefined),
  fc.string(),
);

const arbDepartureTime = fc.oneof(
  fc.constant("08:30"),
  fc.constant("08:30:00"),
  fc.constant("00:00:00"),
  fc.constant("23:59:59"),
  fc.constant("25:99:99"),
  fc.constant(""),
  fc.constant("not-a-time"),
  fc.constant("null"),
  fc.constant(null),
  fc.constant(undefined),
  // HH:MM format variants
  fc
    .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
    .map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`),
  // HH:MM:SS format variants
  fc
    .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }), fc.integer({ min: 0, max: 59 }))
    .map(([h, m, s]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`),
);

const arbWaypointType = fc.oneof(fc.constant("station"), fc.constant("place"), fc.constant("unknown"), fc.string());

const arbWaypoint = fc.record({
  position: arbMaybeCoordinate,
  type: arbWaypointType,
  name: fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
});

const arbWaypoints = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.constant([]),
  fc.array(arbWaypoint, { minLength: 0, maxLength: 5 }),
);

// ---------------------------------------------------------------------------

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fuzz: POST /api/map/route/calculate — known bugs", () => {
  // BUG: a waypoint with `position: undefined` causes 500 via the same code path.
  // When strategy=ptv and a waypoint has position=undefined, the route loop reaches
  // getPTVRoute(undefined, ...) or osrmRoute(undefined, ...) without a guard.
  it("waypoint with undefined position + ptv strategy returns 400, not 500", async () => {
    const res = await request(app)
      .post("/api/map/route/calculate")
      .send({
        origin: { lat: -37.8136, lng: 144.9631 },
        destination: { lat: -37.8235, lng: 144.9898 },
        strategy: "ptv",
        waypoints: [{ position: undefined, type: "station", name: "" }],
      });

    expect(res.status).not.toBe(500);
  });

  // BUG: a waypoint with `position: null` causes 500.
  // The origin/destination null-guard (lines 151-157 of route.ts) does NOT cover
  // intermediate waypoints. When position=null reaches osrmRoute(null, ...) or
  // getPTVRoute(null, ...) the services crash unguarded.
  // Fix: validate all waypoint positions before the segment-building loop.
  it("waypoint with null position returns 400, not 500", async () => {
    const res = await request(app)
      .post("/api/map/route/calculate")
      .send({
        origin: { lat: -37.8136, lng: 144.9631 },
        destination: { lat: -37.8235, lng: 144.9898 },
        strategy: "car",
        waypoints: [{ position: null, type: "station", name: null }],
      });

    expect(res.status).not.toBe(500);
  });
});

describe("fuzz: POST /api/map/route/calculate", () => {
  fcTest.prop([arbMaybeCoordinate, arbMaybeCoordinate, arbStrategy], { numRuns: 75 })(
    "never returns 500 for any origin/destination/strategy",
    async (origin, destination, strategy) => {
      const { teardown } = withCaptureSink("route-calculate-basic");
      try {
        const res = await request(app)
          .post("/api/map/route/calculate")
          .send({ origin, destination, strategy });

        expect(res.status).not.toBe(500);
        expect(res.body).toHaveProperty("success");
      } finally {
        teardown();
      }
    },
  );

  fcTest.prop([arbDepartureTime], { numRuns: 50 })(
    "never returns 500 for any departureTime with valid car route",
    async (departureTime) => {
      const { teardown } = withCaptureSink("route-calculate-departuretime");
      try {
        const res = await request(app)
          .post("/api/map/route/calculate")
          .send({
            origin: { lat: -37.8136, lng: 144.9631 },
            destination: { lat: -37.8235, lng: 144.9898 },
            strategy: "car",
            departureTime,
          });

        expect(res.status).not.toBe(500);
      } finally {
        teardown();
      }
    },
  );

  // BUG FOUND: waypoints with `position: null` causes a 500.
  // The route handler at src/routes/route.ts does not guard against null waypoint
  // positions before passing them to osrmRoute() / getPTVRoute(). The coordinate
  // null-check only covers origin/destination, not intermediate waypoints.
  // Confirmed minimal counterexample: [{ position: null, type: "station", name: null }]
  // This test is narrowed to valid-position waypoints until the bug is fixed.
  const arbWaypointValidPosition = fc.record({
    position: arbCoordinate,
    type: arbWaypointType,
    name: fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
  });
  const arbWaypointsValidPositions = fc.oneof(
    fc.constant(undefined),
    fc.constant([]),
    fc.array(arbWaypointValidPosition, { minLength: 0, maxLength: 4 }),
  );

  fcTest.prop([arbWaypointsValidPositions], { numRuns: 50 })(
    "never returns 500 for waypoints with valid positions (car strategy)",
    async (waypoints) => {
      const { teardown } = withCaptureSink("route-calculate-waypoints-car");
      try {
        const res = await request(app)
          .post("/api/map/route/calculate")
          .send({
            origin: { lat: -37.8136, lng: 144.9631 },
            destination: { lat: -37.8235, lng: 144.9898 },
            strategy: "car",
            waypoints,
          });

        expect(res.status).not.toBe(500);
      } finally {
        teardown();
      }
    },
  );

  // Whole-body fuzzing with safe waypoints (valid positions only).
  // Note: arbitrary waypoints with null/undefined positions trigger the known
  // waypoint-position-null bug (documented in the "known bugs" describe block above),
  // so this generator uses valid positions to avoid that noise.
  const arbSafeWaypointForFullBody = fc.record({
    position: arbCoordinate,
    type: arbWaypointType,
    name: fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
  });
  const arbSafeWaypointsForFullBody = fc.oneof(
    fc.constant(undefined),
    fc.constant([]),
    fc.array(arbSafeWaypointForFullBody, { minLength: 0, maxLength: 3 }),
  );

  fcTest.prop(
    [
      fc.record({
        origin: arbMaybeCoordinate,
        destination: arbMaybeCoordinate,
        strategy: arbStrategy,
        departureTime: arbDepartureTime,
        waypoints: arbSafeWaypointsForFullBody,
      }),
    ],
    { numRuns: 75 },
  )(
    "never returns 500 for fully arbitrary body (safe waypoints)",
    async (body) => {
      const { teardown } = withCaptureSink("route-calculate-fullbody");
      try {
        const res = await request(app)
          .post("/api/map/route/calculate")
          .send(body as object);

        expect(res.status).not.toBe(500);
      } finally {
        teardown();
      }
    },
  );
});
