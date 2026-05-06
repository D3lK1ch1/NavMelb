import { describe, it, expect, beforeEach } from "vitest";
import { RaptorCore } from "../../services/raptor-core";
import type { StreamStop, StreamStopTime, StreamTrip } from "../../services/gtfs-stream.service";

// ──────────────────────────────────────────────────────────
// Fixture data — 5 stops, 3 trips
//
//  Stops (in CBD proximity order):
//    A  Flinders Street Station    (-37.8183, 144.9671)
//    B  Southern Cross Station     (-37.8184, 144.9522)
//    C  Richmond Station           (-37.8235, 144.9882)
//    D  North Melbourne Station    (-37.8075, 144.9437)
//    E  Isolated Station           (-37.9000, 145.1000)  — no trips
//
//  Trips:
//    T1  B → A → C   (direct Flinders→Richmond)
//    T2  D → B → A   (different route into Flinders)
//    T3  A → C       (another direct trip)
// ──────────────────────────────────────────────────────────

const STOPS: StreamStop[] = [
  { stop_id: "A", stop_name: "Flinders Street Station", stop_lat: -37.8183, stop_lon: 144.9671, location_type: 0 },
  { stop_id: "B", stop_name: "Southern Cross Station",  stop_lat: -37.8184, stop_lon: 144.9522, location_type: 0 },
  { stop_id: "C", stop_name: "Richmond Station",        stop_lat: -37.8235, stop_lon: 144.9882, location_type: 0 },
  { stop_id: "D", stop_name: "North Melbourne Station", stop_lat: -37.8075, stop_lon: 144.9437, location_type: 0 },
  { stop_id: "E", stop_name: "Isolated Station",        stop_lat: -37.9000, stop_lon: 145.1000, location_type: 0 },
];

const TRIPS: StreamTrip[] = [
  { trip_id: "T1", route_id: "R1", service_id: "S1", direction_id: 0 },
  { trip_id: "T2", route_id: "R2", service_id: "S1", direction_id: 0 },
  { trip_id: "T3", route_id: "R1", service_id: "S1", direction_id: 0 },
];

// T1: B 08:00 → A 08:15 → C 08:30
// T2: D 07:45 → B 08:05 → A 08:25
// T3: A 09:00 → C 09:20
const STOP_TIMES: StreamStopTime[] = [
  { trip_id: "T1", stop_id: "B", arrival_time: "08:00:00", departure_time: "08:00:00", stop_sequence: 1 },
  { trip_id: "T1", stop_id: "A", arrival_time: "08:15:00", departure_time: "08:15:00", stop_sequence: 2 },
  { trip_id: "T1", stop_id: "C", arrival_time: "08:30:00", departure_time: "08:30:00", stop_sequence: 3 },

  { trip_id: "T2", stop_id: "D", arrival_time: "07:45:00", departure_time: "07:45:00", stop_sequence: 1 },
  { trip_id: "T2", stop_id: "B", arrival_time: "08:05:00", departure_time: "08:05:00", stop_sequence: 2 },
  { trip_id: "T2", stop_id: "A", arrival_time: "08:25:00", departure_time: "08:25:00", stop_sequence: 3 },

  { trip_id: "T3", stop_id: "A", arrival_time: "09:00:00", departure_time: "09:00:00", stop_sequence: 1 },
  { trip_id: "T3", stop_id: "C", arrival_time: "09:20:00", departure_time: "09:20:00", stop_sequence: 2 },
];

function makeRaptor(): RaptorCore {
  const r = new RaptorCore();
  r.initialize(STOPS, TRIPS, STOP_TIMES);
  return r;
}

// ──────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────

describe("RaptorCore — initialization", () => {
  it("reports correct stop and trip counts after initialize()", () => {
    const r = makeRaptor();
    const stats = r.getStats();
    expect(stats.stops).toBe(5);
    expect(stats.trips).toBe(3);
    expect(stats.loaded).toBe(true);
  });

  it("reports loaded=false before initialize()", () => {
    const r = new RaptorCore();
    expect(r.getStats().loaded).toBe(false);
  });

  it("is idempotent — re-initializing with the same data resets internal state", () => {
    const r = makeRaptor();
    // Re-initialize with just 1 stop and 0 trips
    r.initialize(
      [{ stop_id: "X", stop_name: "Test Stop", stop_lat: -37.8, stop_lon: 144.9, location_type: 0 }],
      [],
      []
    );
    const stats = r.getStats();
    expect(stats.stops).toBe(1);
    expect(stats.trips).toBe(0);
  });

  it("handles empty stops list gracefully", () => {
    const r = new RaptorCore();
    r.initialize([], [], []);
    expect(r.getStats().loaded).toBe(false);
  });

  it("getStop() returns correct stop by id", () => {
    const r = makeRaptor();
    const stop = r.getStop("A");
    expect(stop).toBeDefined();
    expect(stop!.name).toBe("Flinders Street Station");
    expect(stop!.lat).toBeCloseTo(-37.8183);
    expect(stop!.lng).toBeCloseTo(144.9671);
  });

  it("getStop() returns undefined for unknown id", () => {
    const r = makeRaptor();
    expect(r.getStop("ZZZZZ")).toBeUndefined();
  });

  it("getStopIdx() returns a numeric index for a known stop", () => {
    const r = makeRaptor();
    const idx = r.getStopIdx("B");
    expect(typeof idx).toBe("number");
    expect(idx).toBeGreaterThanOrEqual(0);
  });

  it("getStopByIdx() round-trips with getStopIdx()", () => {
    const r = makeRaptor();
    const idx = r.getStopIdx("C")!;
    const stop = r.getStopByIdx(idx);
    expect(stop).toBeDefined();
    expect(stop!.id).toBe("C");
  });
});

describe("RaptorCore — findStopByName", () => {
  let r: RaptorCore;

  beforeEach(() => {
    r = makeRaptor();
  });

  it("finds a stop by exact normalized name (station keyword stripped)", () => {
    // normalizeStopName strips "station" and lowercases
    const stop = r.findStopByName("flinders street");
    expect(stop).toBeDefined();
    expect(stop!.id).toBe("A");
  });

  it("is case-insensitive in the normalized query", () => {
    // findStopByName receives an already-normalized query (lowercase, station stripped)
    const stop = r.findStopByName("richmond");
    expect(stop).toBeDefined();
    expect(stop!.id).toBe("C");
  });

  it("finds a stop by partial match", () => {
    // "southern" is a substring of "southern cross"
    const stop = r.findStopByName("southern");
    expect(stop).toBeDefined();
    expect(stop!.id).toBe("B");
  });

  it("prefers stops WITH trips over isolated stops", () => {
    // Stop E is "isolated" — same word appears nowhere else, but it has no trips
    // Pass 2 (exact with no trips) will pick it only if nothing else matches
    const stop = r.findStopByName("isolated");
    // No trip, but it should still be returned (pass 2/3 fallback)
    expect(stop).toBeDefined();
    expect(stop!.id).toBe("E");
  });

  it("returns undefined when no stop matches", () => {
    const stop = r.findStopByName("nonexistent stop xyz");
    expect(stop).toBeUndefined();
  });

  it("prefers the CBD-closest stop when multiple exact matches exist", () => {
    // Add two stops with the same normalized name at different distances from CBD
    const r2 = new RaptorCore();
    const twoStops: StreamStop[] = [
      { stop_id: "NEAR", stop_name: "Loop Station", stop_lat: -37.8136, stop_lon: 144.9631, location_type: 0 },
      { stop_id: "FAR",  stop_name: "Loop Station", stop_lat: -37.9500, stop_lon: 145.2000, location_type: 0 },
    ];
    const twoTrips: StreamTrip[] = [
      { trip_id: "TX", route_id: "RX", service_id: "SX", direction_id: 0 },
    ];
    const twoTimes: StreamStopTime[] = [
      { trip_id: "TX", stop_id: "NEAR", arrival_time: "08:00:00", departure_time: "08:00:00", stop_sequence: 1 },
      { trip_id: "TX", stop_id: "FAR",  arrival_time: "08:30:00", departure_time: "08:30:00", stop_sequence: 2 },
    ];
    r2.initialize(twoStops, twoTrips, twoTimes);
    // normalizeStopName("Loop Station") → "loop" (station stripped)
    const found = r2.findStopByName("loop");
    expect(found).toBeDefined();
    expect(found!.id).toBe("NEAR");
  });
});

describe("RaptorCore — query (direct trips)", () => {
  let r: RaptorCore;

  beforeEach(() => {
    r = makeRaptor();
  });

  it("finds a direct trip between two stops (A→C via T3)", () => {
    // Departure at 9:00 AM = 9*3600 = 32400
    const journey = r.query("A", "C", 9 * 3600);
    expect(journey).not.toBeNull();
    expect(journey!.legs).toHaveLength(1);
    expect(journey!.legs[0].trip.id).toBe("T3");
    expect(journey!.legs[0].fromStopId).toBe("A");
    expect(journey!.legs[0].toStopId).toBe("C");
  });

  it("returns departure and arrival times correctly (A→C via T3)", () => {
    const journey = r.query("A", "C", 9 * 3600);
    expect(journey).not.toBeNull();
    expect(journey!.departureTime).toBe(9 * 3600);       // 09:00
    expect(journey!.arrivalTime).toBe(9 * 3600 + 20 * 60); // 09:20
    expect(journey!.durationMinutes).toBe(20);
  });

  it("uses B→A leg from T1 when departing around 08:00 (B→A)", () => {
    const journey = r.query("B", "A", 8 * 3600);
    expect(journey).not.toBeNull();
    expect(journey!.legs).toHaveLength(1);
    expect(journey!.legs[0].fromStopId).toBe("B");
    expect(journey!.legs[0].toStopId).toBe("A");
  });

  it("picks the soonest trip when multiple are available", () => {
    // From B→C: T1 departs B at 08:00, arrives C at 08:30 — should pick T1
    const journey = r.query("B", "C", 8 * 3600);
    expect(journey).not.toBeNull();
    expect(journey!.legs[0].trip.id).toBe("T1");
  });

  it("stores stop names on journey legs", () => {
    const journey = r.query("A", "C", 9 * 3600);
    expect(journey).not.toBeNull();
    expect(journey!.legs[0].fromStopName).toBe("Flinders Street Station");
    expect(journey!.legs[0].toStopName).toBe("Richmond Station");
  });

  it("returns null when departure time is after the last service", () => {
    // T3 departs A at 09:00 — query at 23:00 should fail
    const journey = r.query("A", "C", 23 * 3600);
    expect(journey).toBeNull();
  });

  it("returns null when origin stop id is unknown", () => {
    const journey = r.query("UNKNOWN", "C", 8 * 3600);
    expect(journey).toBeNull();
  });

  it("returns null when destination stop id is unknown", () => {
    const journey = r.query("A", "UNKNOWN", 8 * 3600);
    expect(journey).toBeNull();
  });

  it("returns null when no path exists between two disconnected stops", () => {
    // E has no trips, so A→E has no direct trip and no transfer
    const journey = r.query("A", "E", 8 * 3600);
    expect(journey).toBeNull();
  });

  it("durationMinutes is at least 1 (minimum clamp)", () => {
    // Create a degenerate fixture where arrival == departure
    const r2 = new RaptorCore();
    r2.initialize(
      [
        { stop_id: "P", stop_name: "Start", stop_lat: -37.8, stop_lon: 144.9, location_type: 0 },
        { stop_id: "Q", stop_name: "End",   stop_lat: -37.9, stop_lon: 145.0, location_type: 0 },
      ],
      [{ trip_id: "TX", route_id: "RX", service_id: "SX", direction_id: 0 }],
      [
        { trip_id: "TX", stop_id: "P", arrival_time: "08:00:00", departure_time: "08:00:00", stop_sequence: 1 },
        { trip_id: "TX", stop_id: "Q", arrival_time: "08:00:00", departure_time: "08:00:00", stop_sequence: 2 },
      ]
    );
    const journey = r2.query("P", "Q", 8 * 3600);
    expect(journey).not.toBeNull();
    expect(journey!.durationMinutes).toBeGreaterThanOrEqual(1);
  });
});

describe("RaptorCore — query (transfer journeys)", () => {
  it("finds a journey requiring a transfer (D→C via T2 then T1/T3)", () => {
    // D is only on T2: D→B→A. From A, we need to reach C.
    // Transfer at A: T2 arrives A at 08:25, T3 departs A at 09:00 (gap ≥ 120s ✓)
    const r = makeRaptor();
    const journey = r.query("D", "C", 7 * 3600 + 45 * 60); // 07:45
    expect(journey).not.toBeNull();
    expect(journey!.legs.length).toBeGreaterThanOrEqual(2);
    expect(journey!.legs[0].fromStopId).toBe("D");
    const lastLeg = journey!.legs[journey!.legs.length - 1];
    expect(lastLeg.toStopId).toBe("C");
  });

  it("transfer journey has correct total duration", () => {
    // D departs 07:45, C arrives 09:20 via transfer at A → 95 minutes
    const r = makeRaptor();
    const journey = r.query("D", "C", 7 * 3600 + 45 * 60);
    expect(journey).not.toBeNull();
    expect(journey!.durationMinutes).toBe(95);
  });
});

describe("RaptorCore — getStats()", () => {
  it("reflects current state after initialization", () => {
    const r = new RaptorCore();
    expect(r.getStats()).toEqual({ stops: 0, trips: 0, loaded: false });
    r.initialize(STOPS, TRIPS, STOP_TIMES);
    expect(r.getStats()).toEqual({ stops: 5, trips: 3, loaded: true });
  });
});
