# NavMelb Backend — Sweep 2: Code Quality

**Date:** 2026-05-06
**Method:** Three-phase audit (design patterns → tech debt + style + test health → pattern synthesis)
**Scope:** Code quality, maintainability, test suite health

---

## Pattern Vocabulary

### In Use

| Pattern | Location | Status |
|---------|----------|--------|
| Observer | `events/dispatch.ts` | Clean |
| Factory Function | `events/sinks/file-sink.ts` | Clean |
| Lazy Singleton | `ptv-api.service.ts` getClient() | Clean |
| Facade | `route-map.service.ts` | Partially bypassed (Feature Envy) |
| Chain of Responsibility | `route.ts` leg iteration | Implicit, not extracted |
| Strategy | RouteStrategy type | Named but hardcoded as if/else |

### Anti-Patterns

- God Handler: `/route/calculate` — 95 lines of inline business logic
- God Module: `gtfs-timetable.service.ts` — 742 lines, 3 responsibilities, 7 mutable Maps
- Duplicate Engine: RAPTOR (600 lines) and gtfs-timetable.service both implement GTFS routing — neither is tested, both load the same data

---

## Scorecard

| Audit | Score /5 | Key Finding |
|-------|----------|-------------|
| Tech Debt | **2** | RAPTOR engine fully built but never wired; gtfs-timetable does parallel loading. Two routing engines coexist. |
| Style | 3 | Route handler reimplements chainJourneyLegs inline; OSRM fallback is silent degradation |
| Test Health | 3 | Inverted pyramid (26% unit / 74% integration); raptor-core and ptv-api have zero tests |

---

## Tech Debt Audit (2/5)

### Debt Register

| # | Item | Interest | Principal | Risk | Leverage | Location |
|---|------|----------|-----------|------|----------|----------|
| 1 | normalizeName duplicated 4× | Med | Low | Med | **High** | 4 service files |
| 2 | RAPTOR engine built but never wired | Low | Low | Med | **High** | raptor-core, gtfs-raptor-streaming |
| 3 | Unconditional console.log in ptv-api | High | Low | Low | Med | ptv-api.service.ts:200-279 |
| 4 | ~10 dead exports across services | Low | Low | Low | Med | route-map, gtfs-stop-index, gtfs-timetable |
| 5 | gtfs-timetable.service god module | High | High | Med | **High** | 742 lines, 3 responsibilities, 7 mutable Maps |
| 6 | Flat module globals (7 mutable Maps) | Med | Med | Med | Med | gtfs-timetable.service.ts:73-110 |
| 7 | index.ts never loads GTFS/Raptor | Med | Low | High | Med | index.ts |

### Low-Debt Areas

- Geocoding service: well-contained, proper throttle, TTL cache
- gtfs-stream.service.ts: pure async generators, no state
- app.ts / index.ts split: enables test isolation
- types/index.ts: coherent shared vocabulary

---

## Style Review (3/5)

### Good

- `ApiResponse<T>` wrapper is consistent across all endpoints
- Types use clear domain language: Coordinate, Waypoint, RouteSegment, FailedLeg
- 207 Multi-Status for partial failures is thoughtful and correct

### Issues

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| 1 | Handler reimplements chainJourneyLegs inline | route.ts:178-274 | 95 lines of duplicated orchestration | Call chainJourneyLegs or extract Strategy |
| 2 | addSecondsToTime exists but handler does inline math | route.ts:229-234 | Reader doesn't know utility exists | Export and use it |
| 3 | Magic array index `["train","tram","bus"][t]` | route.ts:112 | Hidden PTV API contract | Named map: `PTV_ROUTE_TYPE` |
| 4 | OSRM fallback returns fake route silently | route-map.service.ts:51-63 | Caller can't distinguish real from fallback | Add `fallback: boolean` flag |
| 5 | calculateDistance is a pointless wrapper | route-map.service.ts | Renaming without value | Delete, import distanceMeters directly |

### Naming Inconsistencies

- `lookupDestination` (sync) vs `lookupDestinationAny` (async) — prefer `lookupStop` / `lookupPlace`
- `stationStops` means "waypoints whose type is station" — prefer `stationWaypoints`
- `RouteOption` and `Station` types defined but never imported — dead types

---

## Test Health Audit (3/5)

### Pyramid Shape

| Layer | Tests | % | Assessment |
|-------|-------|---|------------|
| Unit | 11 | 26% | Too few for 2,394 lines of service logic |
| Integration | 31 | 74% | Solid but over-relied upon |
| E2E | 0 | 0% | No browser/frontend tests |

**Assessment:** Inverted pyramid. The service layer is undertested relative to its complexity.

### Coverage Gaps

| Gap | Risk | What's Untested |
|-----|------|-----------------|
| raptor-core.ts (388 lines) | **HIGH** | RAPTOR algorithm — zero tests |
| ptv-api.service.ts (297 lines) | **HIGH** | HMAC signing, route finding, departures — zero unit tests |
| gtfs-stream.service.ts (160 lines) | MEDIUM | GTFS zip parsing — zero tests |
| 207 Multi-Status response path | MEDIUM | Failed PTV leg never triggered in tests |
| departureTime normalisation | LOW | HH:MM vs HH:MM:SS branch never exercised |

### Quality Issues

| Issue | Tests Affected | Impact |
|-------|---------------|--------|
| Duplicate `vi.mock` in station-search.test.ts | 6 tests | Second mock silently overwrites first — all tests run against wrong fixture |
| Optional assertion pattern (`if (departureInfo)`) | 1 test | Test passes vacuously when mock returns no departures |
| Loose haversine range (5000-6500m for ~5.5km) | 3 tests | ±750m tolerance masks algorithm regressions |
| No `afterEach(() => vi.useRealTimers())` | 2 test files | Timer state leaks on test failure |

### Flakiness Risks

- `createTestApp()` mutates `process.env.GTFS_ROOT` — parallel workers could race
- Fake timers not cleaned up in afterEach
- Health test creates app at describe scope (before any beforeAll)

---

## Pattern-Based Remediation

### 1. Utility Module (Shared Kernel)

**Addresses:** normalizeName 4x duplication, addSecondsToTime 2x, getTransportType 3x, magic array index

**How:** Extract all three utilities to a single `transport-utils.ts`. The magic `["train","tram","bus"][t]` becomes `getTransportTypeName(t)` with explicit type safety. This is the highest-leverage, lowest-risk fix — pure functions are trivially unit-testable, directly correcting the pyramid inversion.

### 2. Strategy (genuine)

**Addresses:** Hardcoded if/else, God Handler, inline chainJourneyLegs reimplementation

**How:** `RouteStrategy` interface with `calculate()` method. `CarStrategy` and `PtvStrategy` as separate classes. Handler becomes thin dispatcher. `chainJourneyLegs` gets used instead of reimplemented. Strategy boundary creates natural test seams.

### 3. Null Object / Result Type

**Addresses:** Silent OSRM fallback, untested 207 path, vacuous optional assertions

**How:** Discriminated union `RouteResult<T>` (`{ ok: true, route } | { ok: false, reason }`). Callers forced to handle failure by type system. 207 path becomes structurally testable. No more optional assertions.

---

## Cross-Cutting Insight

**The RAPTOR fork is the elephant in the room.** RAPTOR (600 lines, zero wiring, zero tests) and `gtfs-timetable.service` (742 lines, parallel Map-based index) implement the same routing concern twice. One was abandoned, the other is overloaded. Every pattern-level refactor — Strategy extraction, God Handler decomposition, test pyramid correction — will be undermined as long as two competing routing engines silently coexist. Before investing in structural improvements, the project needs to decide: **wire RAPTOR and delete the timetable service's indexing logic, or delete RAPTOR and document why.**

---

## Recommended Actions

1. **Immediate:** Fix duplicate `vi.mock` in station-search.test.ts (silent bug corrupting 6 tests)
2. **Short-term:** Extract shared utilities (normalizeName, getTransportType, addSecondsToTime)
3. **Short-term:** Add unit tests for ptv-api.service.ts (security-sensitive HMAC logic, zero coverage)
4. **Medium-term:** Resolve RAPTOR vs gtfs-timetable fork — decide which wins
5. **Medium-term:** Extract genuine Strategy pattern from route handler
6. **Long-term:** Split gtfs-timetable.service.ts into loader + departure + shape modules
