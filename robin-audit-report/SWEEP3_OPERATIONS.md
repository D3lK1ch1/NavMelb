# NavMelb Backend — Sweep 3: Operations & Infrastructure

**Date:** 2026-05-06
**Method:** Three-phase audit (design patterns → performance + dependencies + production readiness → pattern synthesis)
**Scope:** Performance, supply chain, deployment readiness

---

## Scorecard

| Audit | Score /5 | Critical Gap |
|-------|----------|-------------|
| Performance | **2** | O(n²) startup graph build (225M comparisons); sequential PTV calls; double GTFS memory load |
| Dependencies | 3 | 3 unused deps (one GPL-3.0 with mysql2 transitive); zero CVEs |
| Production Readiness | **2** | No structured logging in prod; lazy credential validation; no SIGTERM handler |

---

## Performance Profile (2/5)

### Startup

- **`buildTransferGraph()`**: O(n²) synchronous loop over ~15,000 stops = ~225M distance comparisons. Blocks event loop for several seconds at startup.
- **`loadGtfsStops()`**: Uses `csv-parse/sync` — fully synchronous bulk CSV parse.
- **RAPTOR + gtfs-timetable.service both load train GTFS**: Same data parsed twice, stored in independent Maps. Estimated peak memory: 60–150MB.

### Hot Paths

| Endpoint | Bottleneck | Impact | Fix |
|----------|-----------|--------|-----|
| POST /route/calculate (ptv) | 7–12 sequential PTV API calls per request (ptvSearchStops×2 + ptvGetDepartures + up to 5×ptvGetPatternWithStops) | **HIGH** | Parallelize origin/dest searches; cache departures |
| GET /destination/lookup | Nominatim throttled to 1 req/1.1s | MEDIUM | Cache covers most cases |
| GET /stations/search | Single PTV call, no caching | MEDIUM | Short TTL cache (30s) |
| GET /streets/nearby | O(n) scan + distanceMeters per street, no spatial index | MEDIUM | R-tree or grid index |
| GET /streets/search | O(n) linear scan, no index | LOW-MED | Prefix trie at startup |
| POST /distance | Pure CPU (Haversine) | LOW | None needed |

### Memory

| Structure | Bounded? | Risk |
|-----------|----------|------|
| stopTimesIndex (Map) | Bounded by GTFS feed | OK |
| geocodeCache (Map) | **Unbounded** — no size limit, no eviction | Memory leak |
| transferCache (Map) | **Unbounded** — never populated anyway (dead code) | Wasted allocation |
| shapeSegmentCache | Bounded at 500 (LRU) | OK |
| RaptorCore + timetable data | **Duplicated** — same data in two independent stores | Double memory |

### Caching Gaps

| Service | Cached? | Should Be? |
|---------|---------|-----------|
| Geocoding (Nominatim) | Yes (TTL Map) | Yes — but unbounded, needs LRU cap |
| PTV responses | **No** | Yes — 30-60s TTL for search/departures |
| OSRM routes | **No** | Yes — identical origin→dest re-fetched every time |
| Transfer journeys | Dead code (cache never written to) | Fix or remove |

---

## Dependency Audit (3/5)

### Vulnerabilities

**Zero** — `npm audit` clean.

### Unused Dependencies

| Package | Size | Risk | Evidence |
|---------|------|------|----------|
| `@turf/turf` | 2.1 MB | Bloat | No import in src/ |
| `archiver` | - | Bloat | No import in src/ |
| `raptor-journey-planner` | - | **GPL-3.0** copyleft; pulls in mysql2 | RAPTOR implemented locally in raptor-core.ts |

### Outdated Packages

All within minor/patch range except TypeScript (5.9 → 6.x major available). Low risk overall.

### License Issue

`raptor-journey-planner` is **GPL-3.0** — copyleft license that requires distributing source under GPL if the software is shipped. This package is unused but its presence in `package.json` creates a compliance question.

---

## Production Readiness (2/5)

### Dimension Scores

| Dimension | Score /5 | Key Gap |
|-----------|----------|---------|
| Observability | 1 | `console.log` silenced in prod; no structured logging reaches production* |
| Reliability | 2 | No SIGTERM handler, no retry logic, no circuit breaker |
| Data Integrity | 2 | No GTFS load validation; street file parsed without try/catch |
| Performance | 2 | No body limit, no rate limit, no compression* |
| Concurrency | 3 | Single-process Node; module state safe but mutable |
| Deployment | 3 | CI + Docker exist; no secrets validation, no env docs |

*\*Addressed by PRs #5, #6, #8, #9 (pending merge to main)*

### Critical Gaps

1. **PTV credentials validated lazily** — `getClient()` initializes on first request. If `PTV_DEV_ID`/`PTV_API_KEY` are missing, the first real request crashes with an unhandled throw. Should validate at startup.

2. **PORT hardcoded to 3000** — No env override. Docker works around it but it's a deployment limitation.

3. **Bare `console.log(JSON.stringify(response.data.stops))`** in `ptvGetPatternWithStops` — Debug artifact left in production code. Will spam stdout with large PTV payloads.

4. **No SIGTERM/SIGINT handler** — Docker `stop` sends SIGTERM; the process dies immediately with no in-flight request draining.

### High Gaps

- No retry on PTV API failures (network blip = failed leg, silently)
- No request timeout on incoming Express requests — slow PTV chain blocks indefinitely
- Street data loaded with `JSON.parse(fs.readFileSync(...))` and no try/catch — corrupt file crashes process
- Health endpoint returns static OK — cannot distinguish "started" from "ready"

### Already Addressed (pending merge)

| Gap | PR |
|-----|-----|
| Event system + structured logging | #5 |
| Production file sinks | #6 |
| Rate limiting | #8 |
| Input validation (body size, query length, coord range) | #9 |
| Health endpoint readiness check | #11 |
| Startup bootstrap (GTFS load guard) | #11 |

---

## Pattern-Based Remediation

### 1. Circuit Breaker (new)

**Addresses:** No retry, lazy credential validation, sequential PTV calls

**How:** Wrap PTV client in a Circuit Breaker that validates credentials eagerly at startup (fail fast). When healthy, promote sequential per-leg calls to `Promise.all()` — 3 calls become 1 round-trip. When PTV is unavailable, open breaker returns graceful degraded response.

### 2. Flyweight + Pre-sorted Index (new)

**Addresses:** O(n²) buildTransferGraph, findDirectTrip re-sorting, unbounded caches

**How:** Bucket stops by geohash tile, compare only within tiles + 8 neighbours (~O(n·k), k≈30). Pre-sort stop_times at index time. Cap geocodeCache with LRU eviction (max 1000 entries).

### 3. Singleton Merge (extends existing)

**Addresses:** Double GTFS memory load, raptor-journey-planner GPL risk

**How:** Collapse RAPTOR + gtfs-timetable into one shared Singleton loader. Both consumers reference same data. Remove raptor-journey-planner (GPL), @turf/turf, archiver. Net: ~60-150MB peak reduction, one licence risk eliminated.

### 4. Facade Hardening (extends existing)

**Addresses:** No SIGTERM, hardcoded PORT, bare console.log, no startup validation

**How:** Add startup validation block (PORT from env, credentials present) and `process.on('SIGTERM')` handler. Replace naked `console.log(JSON.stringify(...))` in ptv-api with structured event dispatch.

---

## Cross-Cutting Insight

**The system was designed around the happy path.** The Observer/Factory/Facade triad exists but each terminates at the boundary it was meant to cross — events don't reach production (on main), the Facade doesn't enforce startup invariants, the Factory builds sinks that aren't wired in. The remediation is less about adding new patterns than about **closing the loops** the existing patterns opened.

PRs #4–#13 close several of these loops (events, sinks, validation, rate limiting, health checks). What remains is: Circuit Breaker for PTV resilience, startup credential validation, SIGTERM handling, and the O(n²) graph build — all wiring fixes, not architectural changes.

---

## Recommended Actions

### Immediate (addressed by existing PRs — merge these)
- Event system + production sinks (#5, #6)
- Rate limiting + body size (#8)
- Input validation chain (#9)
- Startup guard + health readiness (#11)

### New Work Needed
1. **Eager credential validation** — validate PTV_DEV_ID/PTV_API_KEY at startup, not first request
2. **SIGTERM handler** — graceful shutdown with in-flight request draining
3. **Remove unused deps** — @turf/turf, archiver, raptor-journey-planner (GPL risk)
4. **PTV response caching** — 30-60s TTL for ptvSearchStops, ptvGetDepartures
5. **Parallelize PTV origin+dest search** — Promise.all in ptvFindRouteBetweenStops
6. **Cap geocodeCache** — LRU with max 1000 entries
7. **Replace O(n²) buildTransferGraph** — geohash grid index
8. **Pre-sort stop_times at index time** — eliminate per-query sort overhead
9. **Add SIGTERM + PORT env + compression** — standard production hardening
