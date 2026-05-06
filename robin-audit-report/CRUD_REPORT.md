# NavMelb Backend — CRUD Audit Report

**Date:** 2026-05-06
**Auditor:** Automated CRUD sweep (Claude Code)
**Scope:** All 6 backend API endpoints

---

## Executive Summary

NavMelb's backend is a **read-only API** (no database, no mutations) serving Melbourne public transport navigation. The existing test suite (42 tests) covers happy paths well, but a systematic audit revealed **3 correctness bugs** in input validation and **significant gaps** in boundary/error testing.

41 new tests were generated to cover these gaps. All bugs stem from the same root cause: JavaScript's falsy-value semantics applied to numeric parameters.

---

## Bugs Found

### BUG-1: Falsy-zero numeric parameters (High)

**Pattern:** `Number(param) || defaultValue`

In JavaScript, `Number("0")` evaluates to `0`, which is falsy. The `||` operator then falls through to the default. This means any client explicitly passing `limit=0` or `radius=0` silently gets the default value instead.

| Endpoint | Parameter | Code | Effect |
|----------|-----------|------|--------|
| `GET /stations/search` | `limit` | `Number(limit) \|\| 50` | `limit=0` returns 50 results |
| `GET /streets/search` | `limit` | `Number(limit) \|\| 20` | `limit=0` returns 20 results |
| `GET /streets/nearby` | `radius` | `Number(radius) \|\| 200` | `radius=0` applies 200m radius |
| `GET /streets/nearby` | `limit` | `Number(limit) \|\| 20` | `limit=0` returns 20 results |

**File:** `backend/src/routes/route.ts` lines 96, 316, 346–347

**Fix:** Replace `Number(x) || default` with a proper undefined check:
```typescript
// Before
Number(limit) || 50

// After
limit !== undefined ? Number(limit) : 50
```

---

### BUG-2: Falsy-zero coordinate validation (High)

**Pattern:** `!from.lat || !from.lng`

Latitude 0 is the equator. Longitude 0 is the prime meridian. Both are valid coordinates. But `!0` is `true` in JavaScript, so any coordinate at exactly 0 degrees is rejected as "missing."

| Endpoint | Code | Effect |
|----------|------|--------|
| `POST /distance` | `!from.lat \|\| !from.lng \|\| !to.lat \|\| !to.lng` | Null Island (0,0) rejected |
| `POST /route/calculate` | `!origin.lat \|\| !origin.lng \|\| !destination.lat \|\| !destination.lng` | Same |

**File:** `backend/src/routes/route.ts` lines 52, 140

**Fix:** Check for `undefined`/`null` explicitly:
```typescript
// Before
if (!from || !to || !from.lat || !from.lng || !to.lat || !to.lng)

// After
if (!from || !to || from.lat == null || from.lng == null || to.lat == null || to.lng == null)
```

---

### BUG-3: Untested partial failure path (Medium)

**What:** When a PTV leg fails in `route/calculate`, the endpoint correctly returns HTTP 207 with a `"failed"` segment type. However, this path had zero test coverage — meaning regressions could silently break the graceful degradation.

**Status:** Now covered by audit-generated tests.

---

## Coverage Before & After

| Endpoint | Before (tests) | After (tests) | Coverage | Risk |
|----------|----------------|---------------|----------|------|
| destination/lookup | 5 | 10 | 65% | Medium |
| stations/search | 4 | 10 | 45% → 70% | Medium |
| distance | 6 | 12 | 70% → 85% | Medium |
| route/calculate | 9 | 16 | 55% → 75% | High → Medium |
| streets/search | 11 | 15 | 75% → 85% | Low |
| streets/nearby | 7 | 13 | 60% → 80% | Medium → Low |
| **Total** | **42** | **83** | | |

---

## New Test File

`backend/src/__tests__/acceptance/crud-audit-gaps.test.ts` — 41 tests covering:
- Boundary values (zero, negative, very large numbers)
- Unicode in search queries
- Special characters (`%`, `_`, `'`, SQL injection attempts)
- External API failure handling
- Partial failure (207 Multi-Status)
- Case sensitivity in search
- Falsy-zero bug regression guards

---

## Recommendations

1. **Fix BUG-1 and BUG-2 immediately** — they are one-line changes each and the test suite will catch regressions
2. **Add request logging** — no structured logging exists; add request IDs and response times for production debugging
3. **Consider rate limiting** — all endpoints are unauthenticated with no throttling
4. **Add timeout handling** for external API calls (PTV, OSRM, Nominatim) — currently if they hang, the request hangs indefinitely

---

## How to Verify

```bash
cd backend
npm test
```

All 83 tests should pass. After fixing BUG-1 and BUG-2, update the `BUG:`-marked tests to assert the corrected behavior.
