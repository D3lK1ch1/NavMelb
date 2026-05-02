# Changelog

All notable changes to NavMelb are recorded here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).


---

## [0.10.0] — 2026-05-02 — PTV-Only Architecture + Test Infrastructure

### Changed
- **RAPTOR + GTFS removed from startup** — server boots instantly (~750MB RAM saved, ~60s startup eliminated); PTV API is now the sole transit data source
- `index.ts` — removed `loadGtfsStops()`, `loadGtfsTimetables()`, `loadRaptorStreaming()`, `loadRouteAssociations()` on startup
- `route-map.service.ts` — removed RAPTOR branch and GTFS fallback; `getPTVRoute()` calls PTV API only
- `ptv-api.service.ts` — full rewrite: `ptvGetPatternWithStops()` reads correct `departures[]` shape; `/pattern` endpoint uses path params (`/run/{run_ref}/route_type/{route_type}`); `ptvFindStopByName` uses `pickBestStop()`; timeout raised to 30s
- `route.ts` `/stations/search` — `transportType` filter now applied (was read from query but unused); filter order: `map → filter → slice` so `limit` applies to filtered set

### Added
- Geometry straight-line fallback in `getPTVRoute()` — when PTV returns no geopath, falls back to `[[fromLat, fromLng], [toLat, toLng]]` so the segment still renders
- PTV service mocks in acceptance tests — `station-search.test.ts` and `route-calculate.test.ts` now mock `ptv-api.service` so CI runs without PTV credentials

### Fixed
- `getNextDepartureTime()` in `gtfs-timetable.service.ts` — was returning inside the inner loop on first match; now collects `best` across all trips and returns after loop (Sprint 3 bug)
- `MapComponent.tsx` — `onLoadEnd` callback added to WebView; postMessages were firing while WebView was still loading and being dropped; map now always receives route data after load completes
- `routeType` number mapping in `/stations/search` — `0=train`, `1=tram`, `2=bus`; previous filter had train and tram swapped

### Removed
- RAPTOR + GTFS fallback path from `getPTVRoute()` — PTV API only; archived in session notes for revert
- `getAllStops` import from `route.ts` — was unused after GTFS removal

---

## [0.9.0] — 2026-04-22 — Infrastructure: Self-Hosted OSRM

### Changed
- OSRM routing switched from `router.project-osrm.org` (public demo, no SLA) to self-hosted Docker instance — coordinates never leave local infra, no rate limits
- `route-map.service.ts` line 38: OSRM base URL now read from `OSRM_URL` env var; fallback `http://localhost:5000`

### Added
- `docker-compose.yml` — starts OSRM (MLD algorithm, `osrm-data/` volume) + backend together via `docker compose up --build`
- `backend/Dockerfile` — two-stage build
- `backend/.env.example`, `frontend/.env.example` — template env files for new installs
- `set-local-ip.js` — detects LAN IP, writes into both `.env` files; run whenever DHCP reassigns

### Investigated (no code change)
- Southern Cross stop resolution — root cause confirmed: `findStopByName` returns V/Line regional platform over metro; CBD proximity sort (added 2026-04-19) is current mitigation; full fix superseded by pending PTV API swap

---

## [0.8.0] - 2026-04-17 - UI Refactoring
- `MapExplorationScreen.tsx` — strategy is now derived from the stops chain instead of a manual `useState`; `"ptv"` if any stop at index > 0 is a station, otherwise `"car"` — eliminates the class of bug where strategy could drift out of sync with the waypoint list
- `MapExplorationScreen.tsx` — removed Car / PTV strategy toggle buttons; replaced with a contextual hint line under the Place / Station search mode toggle explaining routing implications of each mode
- KeyboardAvoidingView wrap in MapExplorationScreen.tsx

## [0.7.0] — 2026-04-07 — Beta Hardening

### Added
- `FailedLeg` interface (`{ type: "failed"; from: string; to: string }`) — separate from `RouteSegment`, owns the `"failed"` discriminant
- HTTP 207 response when `segments[]` contains any failed leg — partial success is distinguishable from full success (200) or error (400)
- Frontend inline display for failed legs: "No route: X → Y" shown per broken leg without blocking successful legs
- `const log = process.env.NODE_ENV !== "production" ? console.log : () => {}` pattern added to all 9 backend files — `console.error` and `console.warn` intentionally excluded

### Fixed
- `route.ts`: `res.status(...).json(...)` was inside the for-loop, causing `ERR_HTTP_HEADERS_SENT` crash on multi-leg routes — moved after loop
- `RouteSegment.type` incorrectly included `"failed"` — cleaned to `"car" | "ptv"` only; `"failed"` belongs exclusively to `FailedLeg`
- `RouteResult.segments` typed as `(RouteSegment | FailedLeg)[]` on both backend and frontend

### Removed
- Dead `parseGtfsTime` function from `gtfs-stream.service.ts` — confirmed uncalled

---

## [0.6.0] — 2026-04-03 — UX Decisions + Security

### Added
- CORS restriction in `app.ts` — locked to `["http://localhost:8081", "http://localhost:3000"]` (previously open)
- `frontend/.env` rule documented: only URLs live there, never secrets; future API keys go in `backend/.env` only
- Map tap → uses exact coordinates; OSRM car fallback if no GTFS stop resolved (already implemented in `route.ts` lines 223–236)
- Failed leg behaviour → show successful legs, flag broken leg inline (implemented in 0.7.0)
- Waypoint mutability → full reorder, remove, reverse (implemented in 0.8.0)

---

## [0.5.0] — 2026-03-29 — Free Waypoint Chaining + Station Search UX

### Added
- Pairwise routing loop in `route.ts`: `station → station` = PTV leg, anything else = car leg — replaces hardcoded park-and-ride strategy
- `displayName` field on `StopEntry` — stores original casing for display, normalized key used for internal search
- `loadRouteAssociations()` in `gtfs-stop-indexservice.ts` — non-blocking background load; attaches up to 5 route names per stop
- `StopInfo` now returns `displayName` and `routeNames[]` from `/stations/search`
- Transport type icon helper in `MapExplorationScreen.tsx` — train / tram / bus indicator in search results

### Removed
- `park-and-ride` strategy — removed from `RouteStrategy` type on both backend and frontend; now covered by the general pairwise loop in `ptv` strategy

### Changed
- PTV mode now requires minimum 1 station (was 2) — car-only segments are valid when no adjacent station pair exists

---

## [0.4.0] — 2026-03-27 — Code Quality Refactor

### Added
- `backend/src/utils/geo.ts` — single shared Haversine `distanceMeters()` implementation; previously duplicated 4 times across services
- Discriminated union `TripResult = DirectTrip | MultiLegTrip` with `kind` field — replaces `as unknown as` unsafe casts in `getTripBetweenStations()`

### Changed
- `createLRUCache` renamed to `createBoundedCache` — implementation was FIFO, not LRU; renamed to match actual behaviour

### Removed
- Duplicate Haversine implementations from `route-map.service.ts`, `gtfs-stop-indexservice.ts`, `gtfs-timetable.service.ts`, `street-data.service.ts`

---

## [0.3.0] — 2026-03-22–25 — Raptor Integration + GTFS Fixes

### Added
- `gtfs-raptor-streaming.service.ts` — streaming Raptor implementation for multi-leg transit routing
- `findStopByName()` in `raptor-core.ts` — normalized name lookup that prefers platform stops (those with trips) over parent station nodes
- 800ms deadline in `RaptorCore.findTransferJourney()` — prevents synchronous triple-nested loop from blocking the Node.js event loop; returns null to trigger timetable fallback
- `findNearestStation(coord, maxDistanceMeters?)` in `gtfs-stop-indexservice.ts` — reverse-geocode coordinates to nearest GTFS stop (default max 1500m)
- 150m proximity merge in stop index — stops from different feeds at the same location are merged under the canonical name

### Fixed
- Server startup blocked by `await loadRaptorStreaming()` before `app.listen()` — Raptor now loads in background; server accepts requests immediately (graceful degradation via `isRaptorLoaded()`)
- `raptor.getStop(normalizedName)` was passing a human-readable name to a raw ID lookup — replaced with `raptor.findStopByName()`
- Platform ID mismatch — GTFS `location_type=1` parent stations don't appear in `stop_times`; code now prefers child platform stops that have trips
- `getPTVRoute()` final leg called with missing `toName` argument — now resolves nearest station to destination coordinates before calling
- Haversine `dLng` calculation used `coord1.lat` instead of `coord1.lng` for longitude difference

### Changed
- Train-only feeds (1, 2, 10) loaded into timetable to stay within memory constraints — tram and bus feeds skipped

---

## [0.2.0] — 2026-03-20 — PTV Route Geometry Fix

### Fixed
- `getPTVRoute()` accepted `fromName`/`toName` parameters but discarded them (underscore-prefixed) — always returned a straight line with fake durations
- Connected `getTripBetweenStations()` — was defined but never called; now actually powers PTV leg geometry and duration
- Added `stopIdToTrips` reverse index in `gtfs-timetable.service.ts` for O(1) stop→trips lookup

---

## [0.1.0] — 2026-03-05 — Strategy-Based Routing

### Added
- `RouteStrategy` type: `"car" | "pt" | "park-and-ride"`
- `Waypoint` interface with position, type (station/place), name, transportType
- `RouteResult` with segments, totalDistance, totalDuration, estimatedArrival, departureInfo
- `gtfs-timetable.service.ts` — loads `trips.txt` and `stop_times.txt`; `getNextDepartureTime()`, `findDeparturesForWaypoints()`
- 3-button strategy selector on frontend: Car | PT | Park & Ride
- Auto-recalculate via `useEffect` watching origin, destination, waypoints, and strategy

### Changed
- `/route/calculate` refactored from `from/to/viaStations/routeType/finalByTrain` to `origin/destination/waypoints/strategy`

---

## [0.0.1] — 2026-02-28 — Initial GTFS + Combined Routing

### Added
- GTFS stop loading with transport type detection from feed folder name (`1/2/10` = train, `3` = tram, `4/5/6/11` = bus)
- `TransportType` type and `StopEntry` interface with position and transport type
- `/stations/search` endpoint with optional `transportType` query param
- Combined route logic: car from start → first station, train between consecutive stations, configurable final leg
- Real-time route preview — auto-calculates when place selected, station added, or toggle changed
