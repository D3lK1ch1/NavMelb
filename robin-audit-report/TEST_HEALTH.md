# NavMelb Backend — Test Health Audit

**Date:** 2026-05-06
**Scope:** Full test suite on main branch (42 tests)
**Verdict:** Suite protects the happy path through fixtures but provides false confidence about the routing engine. Most critical code has zero coverage.

---

## Scorecard

| Dimension | Score /5 | Key Finding |
|-----------|----------|-------------|
| Pyramid Shape | **1** | 88% acceptance tests, 0% true unit tests for core logic |
| Coverage Gaps | **2** | RAPTOR, PTV adapter, route-map service — completely untested |
| Test Quality | **2** | Double-mock bug; optional assertion; loose range checks |
| Flakiness Risk | 3 | Cache cross-contamination; env var bleed; fake timer cleanup |
| Maintainability | 3 | createTestApp helper is good; mock duplication is bad |

---

## Test Pyramid

```
       /\
      /  \        0 tests (0%)
     / E2E\
    /------\
   /        \    32 tests (76%)  ← top-heavy
  / Acceptance\
 /   (HTTP)    \
/--------------\
/ Unit + Service \ 10 tests (24%)
------------------
```

| Level | Count | % | Assessment |
|-------|-------|---|------------|
| Unit | 3 | 7% | Only haversine — no unit tests for any service |
| Service/Integration | 7 | 17% | GTFS stops, timetable, geocoding cache |
| Acceptance (HTTP) | 32 | 76% | All 6 routes via supertest + mocked externals |
| E2E | 0 | 0% | No browser/frontend tests |

**Verdict:** Inverted pyramid. The acceptance layer dominates, meaning refactoring internal services breaks nothing in the test suite — you get false green.

---

## Critical Coverage Gaps

| Gap | Risk | What's Untested |
|-----|------|-----------------|
| `raptor-core.ts` (388 lines) | **HIGH** | RAPTOR multi-modal routing algorithm — zero tests |
| `gtfs-raptor-streaming.service.ts` (205 lines) | **HIGH** | Streaming RAPTOR loader — zero tests |
| `route-map.service.ts` (osrmRoute, getPTVRoute, lookupDestinationAny) | **HIGH** | Core routing orchestration — zero unit tests |
| `ptv-api.service.ts` (ptvSearchStops, ptvGetDepartures, ptvFindRouteBetweenStops) | **HIGH** | All PTV API interaction — zero unit tests |
| HTTP 207 partial failure path | **MEDIUM** | PTV leg fails → 207 with failed segment — never tested |
| Falsy-zero validation (`from.lat = 0`) | **MEDIUM** | Valid coordinate rejected by truthy check |
| All 500 error paths | LOW | catch blocks return 500 — none tested |

---

## Weak Tests

| File | Issue | Impact | Fix |
|------|-------|--------|-----|
| `station-search.test.ts:7-29` | **Two `vi.mock` calls for same module** — second silently overwrites first | Transport-type filter tests run against wrong fixture (tram mock instead of train+tram) | Merge into one mock returning both stop types |
| `route-calculate.test.ts:136-161` | **Optional assertion**: `if (res.body.data.departureInfo)` | Test passes vacuously when mock returns no departures | Assert unconditionally or restructure mock |
| `route-calculate.test.ts:93-119` | `segments.length >= 1` — too weak | Doesn't verify segment count, order, or types | Assert exact segment structure |
| `gtfs-stops.test.ts:10-16` | `length >= 7 && <= 9` — loose range | Doesn't assert exact count from known fixture | Use exact count |
| `geocoding.test.ts:32-46` | Cache test relies on module-level cache being warm from prior test | Order-dependent — passes only because warm-cache test runs after cold-cache | Expose cache.clear() or reset in beforeEach |

---

## Flakiness Risks

| File | Risk | Fix |
|------|------|-----|
| `geocoding.test.ts` | Module-level cache shared between runs — "cache hit" depends on prior test | Expose `cache.clear()` or inject cache |
| `gtfs-timetable.test.ts` | `process.env.GTFS_ROOT` set globally in beforeAll — bleeds to parallel suites | Restore in afterAll |
| `route-calculate.test.ts` | `vi.useFakeTimers()` not in afterEach cleanup — leaks on test failure | Wrap in afterEach(() => vi.useRealTimers()) |

---

## What's Good

- **`createTestApp` helper** with fixture GTFS data is well-designed and consistent
- **Haversine tests** are clean unit tests with meaningful numeric bounds
- **Fixture isolation** — tests use local GTFS + GeoJSON, not real data
- **Happy path covered** for all 6 endpoints
- **Validation (400) tested** for missing params on all routes

---

## Impact of Pending PRs

| PR | Tests Added | What It Fixes |
|----|-------------|---------------|
| **#4** (CRUD edge cases) | 41 | Falsy-zero bug, boundary values, Unicode, error paths — **most impactful for regression protection** |
| **#5** (Fuzz tests) | 17 | Property-based testing: no input produces 500. Catches waypoint null crash, Haversine overflow |
| **#13** (Architecture contracts) | 40 | Module boundary tests — fills the service-level gap without network calls |
| **#16** (Categorical laws) | 61 | Idempotence, round-trip, Kleisli laws — validates utility correctness |

After merging all PRs: **42 → 200+ tests**, pyramid becomes healthier (contract + law tests add unit-level coverage), and the double-mock bug is fixed in #13.

**But even after merging:** RAPTOR (388 lines) and PTV adapter (297 lines) still have zero dedicated tests. These are the highest-risk untested modules.

---

## Recommended Test Additions (priority order)

1. **Unit tests for `route-map.service`** (osrmRoute, getPTVRoute, lookupDestinationAny) — most complex untested code
2. **Fix the double-mock bug** in station-search.test.ts — invalidates 6 tests [fixed in PR #13]
3. **Test HTTP 207 partial failure** — PTV leg fails, others succeed [covered in PR #4]
4. **Unit tests for `raptor-core.ts`** — RAPTOR algorithm has no coverage at all
5. **Unit tests for `ptv-api.service.ts`** — HMAC signing logic is security-sensitive
6. **Merge PR #4** — most regression protection per test added
