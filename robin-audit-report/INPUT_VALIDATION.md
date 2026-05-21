# Input Validation Chain — Audit Report

## Overview

Added guard clauses at the boundary of all 6 route handler functions in `backend/src/routes/route.ts`. No middleware abstractions were created — all validation is inline early-returns matching the existing pattern.

## What Was Added

### 1. `/destination/lookup` (GET)
- **Query length**: Rejects `query.length > 200` with 400

### 2. `/distance` (POST)
- **NaN guards**: Rejects non-numeric `from.lat`, `from.lng`, `to.lat`, `to.lng` with 400
- **Coordinate range**: Rejects `lat` outside [-90, 90] with 400
- **Coordinate range**: Rejects `lng` outside [-180, 180] with 400

### 3. `/stations/search` (GET)
- **Query length**: Rejects `query.length > 200` with 400
- **Limit ceiling**: Rejects `limit > 100` with 400
- **Limit floor**: Rejects `limit < 0` with 400
- **Limit type**: Rejects non-integer `limit` (including NaN, floats) with 400

### 4. `/route/calculate` (POST)
- **NaN guards**: Rejects non-numeric `origin.lat`, `origin.lng`, `destination.lat`, `destination.lng` with 400
- **Coordinate range**: Rejects `lat` outside [-90, 90] with 400
- **Coordinate range**: Rejects `lng` outside [-180, 180] with 400
- **Waypoint cap**: Rejects `waypoints.length > 20` with 400
- **departureTime format**: Validates against `/^\d{2}:\d{2}(:\d{2})?$/` — rejects malformed strings with 400
- **departureTime range**: Validates hours 0–23, minutes/seconds 0–59 with 400

### 5. `/streets/search` (GET)
- **Query length**: Rejects `query.length > 200` with 400
- **Limit ceiling**: Rejects `limit > 100` with 400
- **Limit floor**: Rejects `limit < 0` with 400
- **Limit type**: Rejects non-integer `limit` (including NaN, floats) with 400

### 6. `/streets/nearby` (GET)
- **NaN guards**: Rejects non-numeric `lat`, `lng`, `radius` with 400
- **Coordinate range**: Rejects `lat` outside [-90, 90] with 400
- **Coordinate range**: Rejects `lng` outside [-180, 180] with 400
- **Limit ceiling**: Rejects `limit > 100` with 400
- **Limit floor**: Rejects `limit < 0` with 400
- **Limit type**: Rejects non-integer `limit` (including NaN, floats) with 400

## Inputs That Are Now Rejected

| Input | Condition | HTTP Status |
|-------|-----------|-------------|
| `query` | Length > 200 chars | 400 |
| `limit` | > 100 | 400 |
| `limit` | < 0 | 400 |
| `limit` | Non-integer (float, NaN, string) | 400 |
| `lat` | NaN | 400 |
| `lng` | NaN | 400 |
| `radius` | NaN | 400 |
| `lat` | Outside [-90, 90] | 400 |
| `lng` | Outside [-180, 180] | 400 |
| `waypoints` | Array length > 20 | 400 |
| `departureTime` | Does not match `HH:MM` or `HH:MM:SS` | 400 |
| `departureTime` | Hours outside 0–23 or minutes/seconds outside 0–59 | 400 |

## Before/After Comparison

### Before

| Endpoint | Previous boundary safety |
|----------|--------------------------|
| `/destination/lookup` | Only checked query presence |
| `/distance` | Only checked lat/lng presence (truthy check), no range or NaN validation |
| `/stations/search` | Only checked query presence; `limit` silently clamped via `Number(limit) \|\| 50` |
| `/route/calculate` | Only checked origin/destination presence and strategy value |
| `/streets/search` | Only checked query presence; `limit` silently clamped |
| `/streets/nearby` | Only checked lat/lng presence; all other params unchecked |

### After

All 6 endpoints validate at the boundary before any service call is made. Invalid inputs produce a clear 400 with a descriptive error message. No silent clamping, no NaN propagation, no coordinate overflow into downstream services.

## Test Results

All 42 existing tests continue to pass with no modifications.
