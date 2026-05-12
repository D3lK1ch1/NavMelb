# NavMelb Backend — Fuzz Test Report

**Date:** 2026-05-06
**Auditor:** Automated fuzz sweep (Claude Code)
**Scope:** All 6 backend API endpoints, ~1100 random inputs via fast-check

---

## Executive Summary

Property-based fuzz testing was applied to all 6 API endpoints using `@fast-check/vitest`. The core invariant: **no input should ever produce a 500 response.** A 400/404 means validation caught it (correct); a 500 means untrusted input reached unprotected code (bug).

Two bugs were found and fixed. Both were cases where malformed input bypassed existing validation guards.

---

## Bugs Found & Fixed

### BUG-1: Waypoint null/undefined position crashes route calculation (High)

**Shrunk counterexample:**
```json
{
  "origin": { "lat": -37.8136, "lng": 144.9631 },
  "destination": { "lat": -37.8235, "lng": 144.9898 },
  "waypoints": [{ "position": null, "type": "station", "name": "X" }],
  "strategy": "car"
}
```

**Root cause:** The route handler validates `origin` and `destination` coordinates but did NOT validate intermediate waypoint positions. When `waypoint.position` is null/undefined, it's passed directly to `osrmRoute()` / `getPTVRoute()` which crash on property access.

**Fix:** Added a pre-loop validation guard that checks all waypoint positions for null/missing lat/lng before entering the segment-building loop. Returns 400 with a clear error message.

**File:** `src/routes/route.ts`

---

### BUG-2: Haversine produces non-finite results on extreme doubles (Medium)

**Shrunk counterexample:**
```json
{ "from": { "lat": 5.72e307, "lng": 5.72e307 }, "to": { "lat": 1, "lng": 1 } }
```

**Root cause:** Extreme double values (e.g. `5.72e307`) pass the `== null` guard since they're valid numbers, but `Math.sin()` / `Math.cos()` on such values produce `Infinity`/`NaN`, resulting in a non-finite distance being returned to the client.

**Fix:** Clamp latitude to [-90, 90] and longitude to [-180, 180] before Haversine arithmetic. Added final `isFinite()` guard on the result.

**File:** `src/utils/geo.ts`

---

## Fuzz Test Coverage

| Endpoint | Properties Tested | Iterations | Result |
|----------|-------------------|------------|--------|
| GET /destination/lookup | Arbitrary query strings, nasty strings | 125 | Pass |
| POST /distance | Arbitrary body shapes, valid coords, extreme doubles | 175 | Pass (after fix) |
| GET /stations/search | Arbitrary query + limit + transportType combos | 150 | Pass |
| POST /route/calculate | Arbitrary bodies, null waypoints, departure times | 250 | Pass (after fix) |
| GET /streets/search | Arbitrary query strings, limits | 175 | Pass |
| GET /streets/nearby | Arbitrary lat/lng/radius/limit | 175 | Pass |
| **Total** | | **~1,100** | **All pass** |

---

## Input Generators Used

- **Nasty strings:** empty, "null", "undefined", SQL injection, XSS, path traversal, null bytes, 10K-character strings
- **Coordinates:** valid ranges, zero (equator/prime meridian), extreme doubles, NaN, out-of-range
- **JSON bodies:** fully arbitrary (fc.jsonValue), structured with random field types, null/undefined fields
- **Query params:** arbitrary strings, numeric edge cases (0, -1, 99999999999999999)

---

## Event Capture System

Each fuzz test registers a **capture sink** via the new event system. When a property fails, the sink flushes all events emitted during that iteration to `src/__tests__/fuzz/logs/*.jsonl`. This provides a full timeline of what the business logic did before the crash — invaluable for diagnosis.

Example timeline for BUG-1 (before fix):
```
(no events captured)  ← crash happened before any business event was emitted
```
This immediately told us the failure was in validation/routing, not in business logic.

---

## Infrastructure Added

| File | Purpose |
|------|---------|
| `src/__tests__/fuzz/sinks/capture-sink.ts` | Reusable event capture for fuzz test diagnosis |
| `src/__tests__/fuzz/destination-lookup.fuzz.test.ts` | Fuzz: destination lookup |
| `src/__tests__/fuzz/distance.fuzz.test.ts` | Fuzz: distance calculation |
| `src/__tests__/fuzz/stations-search.fuzz.test.ts` | Fuzz: station search |
| `src/__tests__/fuzz/route-calculate.fuzz.test.ts` | Fuzz: route calculation |
| `src/__tests__/fuzz/streets-search.fuzz.test.ts` | Fuzz: street search |
| `src/__tests__/fuzz/streets-nearby.fuzz.test.ts` | Fuzz: nearby streets |

---

## How to Run

```bash
cd backend

# Run only fuzz tests
npx vitest run src/__tests__/fuzz/

# Run full suite (100 tests)
npm test
```

---

## Recommendations

1. **Add coordinate range validation at the boundary** for all endpoints accepting lat/lng — currently only the Haversine function clamps, but invalid coordinates still reach other service calls
2. **Consider adding a request body size limit** — Express 5 has no default body size limit, meaning a multi-MB JSON payload could be sent
3. **Run fuzz tests in CI** with a fixed seed for determinism, but periodically with random seeds to discover new edge cases
