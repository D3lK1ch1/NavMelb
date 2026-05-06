# NavMelb Backend — Sweep 1: Contracts & Security

**Date:** 2026-05-06
**Method:** Three-phase audit (design patterns → parallel audits → pattern synthesis)
**Scope:** API contracts, data integrity, security

---

## Pattern Vocabulary

### Patterns In Use

| Pattern | Location | Notes |
|---------|----------|-------|
| Observer | `events/dispatch.ts` | registerSink/dispatch — clean, functional |
| Factory Function | `events/sinks/file-sink.ts` | createFileSink() returns configured closure |
| Lazy Singleton | `ptv-api.service.ts` | getClient() — module-level, first-call init |
| Facade | `route-map.service.ts` | lookupDestinationAny, getPTVRoute, osrmRoute |
| Chain of Responsibility | `route.ts` /route/calculate | Implicit — pairwise leg iteration |
| Strategy (named, not real) | `route.ts` | "car"\|"ptv" resolved via if/else, not polymorphism |
| Template Method (partial) | `events/infra.ts` | classifyInfraError classification table |

### Anti-Patterns Found

| Issue | Location | Impact |
|-------|----------|--------|
| God Handler | `/route/calculate` (~100 lines) | 7 concerns in one function — validation, normalisation, time arithmetic, leg routing (2 types), departure-info fetching, partial-failure detection, response shaping |
| Duplicate time arithmetic | `route.ts` + `route-map.service.ts` | Utility function exists (`addSecondsToTime`) but route handler reimplements inline |
| Feature Envy | `route.ts` departureInfo block | Reaches into PTV internals (ptvFindStopByName + ptvGetDepartures), bypassing the facade |
| Magic Number | `ptv-api.service.ts` | AVG_DWELL_SECONDS = 90, uncited, no configuration point |
| Type Duplication | `ptv-api.service.ts` | Local Coordinate interface duplicates `types/index.ts` definition |

---

## Scorecard

| Audit | Score /5 | Critical Gaps |
|-------|----------|---------------|
| API Contracts | 3.5 | /distance should be GET; slice-before-filter; NaN passthrough |
| Migration Safety | 3 | Silent empty load; non-atomic rebuilds; phantom stops at 0,0 |
| Security | **2** | Unbounded waypoints (DoS); no input limits; no rate limiting |

---

## API Contract Audit (3.5/5)

### Good

- Envelope shape (`{success, data?, error?, timestamp}`) is consistent across all 6 endpoints via `ApiResponse<T>`
- Error responses uniformly use `{success: false, error: string, timestamp}`
- GET endpoints are safe/idempotent
- 207 Multi-Status for partial route failure is semantically correct
- departureTime normalisation (HH:MM → HH:MM:SS) is defensive

### Critical Issues

1. **`/distance` is POST but pure computation** — no side effects, no server state. Should be GET with query params. Violates HTTP semantics (not cacheable, not retryable by intermediaries).

2. **`slice()` runs before `filter()` in /stations/search** — a `limit=5` with `transportType="train"` can return fewer than 5 results. Order should be filter-then-slice.

3. **departureTime silently accepted for car strategy** — the parameter is meaningless for car routes but no validation or 400 is returned.

### Medium Issues

- No NaN guards on numeric query params (`Number("abc")` → NaN propagates silently)
- No pagination metadata (`total`, `truncated`) on list endpoints
- Variable shadowing (`const now`) inside route handler

### Low Issues

- URL naming inconsistency: `/destination/lookup` vs `/streets/nearby` (noun/verb vs noun/adjective)
- transportType filter magic numbers (0=train, 1=tram, 2=bus) not referenced from enum
- 207 response lacks top-level `failedLegs` count — clients must walk segments[]

---

## Security Audit (2/5)

### Critical

| Issue | Location | Impact | Fix |
|-------|----------|--------|-----|
| Unbounded waypoints array | `route.ts:141` | 1000 waypoints → ~5000 upstream HTTP calls, exhausting PTV rate limits and file descriptors | Reject `waypoints.length > 20` before any I/O |
| No coordinate range validation | `route.ts`, `route-map.service.ts` | lat=999 or NaN accepted, garbage geometry or Infinity in responses | Clamp lat [-90,90], lng [-180,180] at boundary |
| Unbounded query string length | `route.ts:12,89,330` | 10MB query forwarded to Nominatim/PTV as URL param, held in Node memory | Reject `query.length > 200` |
| Unbounded limit parameter | `route.ts:103,340` | `limit=99999999` serialises full stop list in response | Cap at 100, reject non-integer/negative |

### High

| Issue | Location | Impact | Fix |
|-------|----------|--------|-----|
| No explicit body size limit | `app.ts` | Express defaults to 100KB but not explicitly set | `express.json({ limit: "16kb" })` |
| departureTime not validated | `route.ts:182` | "99:99:99" produces nonsense arrival estimates | Validate `/^\d{2}:\d{2}(:\d{2})?$/` + range check |
| No rate limiting | All endpoints | Trivial flood exhausts PTV quota | `express-rate-limit` (60 req/min per IP) |

### Medium

- SSRF via OSRM_URL env var — no allowlist validation on assembled URL
- Console sink logs full event objects in non-production — query content may leak to log aggregators

### Low

- PTV API key sent as plain header alongside HMAC signature (redundant exposure)
- CORS_ORIGIN env var accepts space-separated values silently (misconfiguration risk)

---

## Migration / Data Integrity Review (3/5)

### Risks

| Risk | Location | Impact | Mitigation |
|------|----------|--------|-----------|
| Silent empty load on corrupt GTFS | `gtfs-stream.service.ts:68-70` | Server starts with empty index, all lookups return nothing | Throw after dispatch, or set health-check flag → 503 |
| No startup guard for Raptor planner | `index.ts` | `loadRaptorStreaming()` not called from bootstrap; planner stays unloaded | Call in bootstrap(), exit(1) if fails |
| Non-atomic global rebuild | `gtfs-stop-indexservice.ts:27-29` | `stopIndex.clear()` then rebuild — concurrent request sees partial data | Build into local var, swap atomically |
| `parseFloat(x) \|\| 0` on GTFS columns | `gtfs-stream.service.ts:61-62` | Missing column → stop placed at lat/lng 0,0 (Null Island) | Apply NaN guard (as in gtfs-stop-indexservice.ts) |
| PTV response shape assumed | `ptv-api.service.ts:132-213` | Field rename → TypeError propagates to caller | Add runtime schema validation (zod) |

### Good Practices

- BOM stripping before CSV parsing (handles Windows-encoded GTFS)
- NaN/empty-name guard in `gtfs-stop-indexservice.ts:104`
- Axios timeout (30s) on PTV client prevents indefinite hangs
- Atomic array clear after Raptor init manages peak memory
- Structured event dispatch on failures (not bare console.log)

---

## Pattern-Based Remediation

### 1. Validation Chain (new)

**Addresses:** Unbounded waypoints, unbounded limit, NaN params, coordinate range, query length, departureTime format

**Where:** New middleware layer before route handlers

**How:** Compose pure validator functions (maxItems, rangeCheck, timeFormat, nanGuard) into a pipeline. Each returns `Result<T, ValidationError>`; first failure short-circuits with 400. Waypoint cap and limit ceiling become named constants.

---

### 2. Repository + Null Object (new)

**Addresses:** Silent empty load, phantom stops at 0,0, PTV response shape assumption, startup guard

**Where:** Replace mutable globals in GTFS loader and PTV client

**How:** `GtfsRepository.load()` returns `Result<PlannerData, LoadError>` — failure is a typed error, not an empty dataset. PTV responses parsed through schema validator. Server refuses to start on repository failure.

---

### 3. Command + Strategy (new)

**Addresses:** God Handler, hardcoded if/else, Feature Envy, /distance semantics

**Where:** `route.ts` → extracted into `commands/` and `strategies/`

**How:** Extract a `RouteCommand` record carrying validated inputs. `CarRouteStrategy` and `PtvRouteStrategy` implement `execute(cmd): Promise<RouteResult>`. Selection via dispatch table. God Handler becomes: validate → build command → select strategy → execute → serialize. `/distance` becomes a pure function (GET-safe by construction).

---

### 4. AsyncSingleton (enhance existing)

**Addresses:** Non-atomic rebuild, race on reload, startup guard

**Where:** Generalize PTV client's Lazy Singleton to GTFS/Raptor initialization

**How:** Promise-locked singleton: if load is in progress, new requests await same promise. On completion, swap reference atomically. Prevents partial-state visibility during reload.

---

## Cross-Cutting Insight

Every critical finding across all three audits is a **boundary problem**. The system's interior is well-structured (Observer, Facade, Singleton) but its edges are unguarded:
- **Inbound boundary** (HTTP layer): no input contracts enforced
- **Outbound boundary** (external APIs): no response schemas validated
- **Data boundary** (GTFS files): no load-failure contracts

Fixing the boundaries first (Validation Chain inward, Repository outward) addresses the majority of findings without touching business logic, making interior refactors (Command/Strategy) lower-risk afterward.

---

## Recommended Implementation Order

1. **Validation Chain** — immediate security ROI, no structural changes needed
2. **Repository pattern for GTFS** — prevents silent startup failures
3. **Rate limiting** — one-liner with `express-rate-limit`
4. **Command/Strategy extraction** — largest refactor, lowest urgency (correctness not affected)
