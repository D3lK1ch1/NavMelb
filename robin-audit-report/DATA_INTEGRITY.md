# Data Integrity & Startup Safety Audit

**Branch:** fix/data-integrity-startup  
**Date:** 2026-05-06  

---

## What Was Fixed

### 1. parseFloat fallback — Null Island phantom stops

**File:** `backend/src/services/gtfs-stream.service.ts`

**Before:** `parseFloat(row.stop_lat) || 0` — when a CSV row has a missing or blank `stop_lat` column, `parseFloat` returns `NaN`, the `|| 0` fallback maps it to `0.0`, and a phantom stop is created at latitude 0, longitude 0 (Null Island in the Gulf of Guinea).

**After:** Parse into a named variable, guard with `isNaN(lat) || isNaN(lon)`, and `continue` to skip the row entirely. This matches the existing guard pattern in `gtfs-stop-indexservice.ts`.

---

### 2. GTFS load failure — silent empty index

**File:** `backend/src/services/gtfs-stream.service.ts`

**Before:** All three generators (`streamStopsFromZip`, `streamStopTimesFromZip`, `streamTripsFromZip`) caught errors, logged them, and silently returned — leaving callers with an empty result and no way to know that loading had failed. The server started with an empty stop index.

**After:** After logging, each catch block re-throws the error (`throw err`). This surfaces corruption (bad zip, missing file mid-stream) to `streamFeedData` and ultimately to `loadRaptorStreaming`, which can log and handle it appropriately. The new module-level `gtfsLoaded` flag in the stop index service also lets the health endpoint report status accurately.

---

### 3. Atomic stop index rebuild — concurrent partial reads

**File:** `backend/src/services/gtfs-stop-indexservice.ts`

**Before:** `loadGtfsStops()` called `stopIndex.clear()` then rebuilt the map incrementally. Any concurrent request arriving during the rebuild — which can take seconds for large GTFS feeds — would see a partial index: some stops present, most missing.

**After:** The function now builds into a `newIndex` local `Map`, then atomically swaps the module-level `stopIndex` reference once construction is complete (`stopIndex = newIndex`). Concurrent readers always see either the old complete index or the new complete index, never a partial one. The `cachedStops` cache and `gtfsLoaded` flag are updated immediately after the swap.

---

### 4. Health endpoint enhancement

**File:** `backend/src/app.ts`

**Before:** `GET /health` always returned `200 { status: "ok", timestamp: ... }` regardless of whether GTFS data had loaded.

**After:** The endpoint imports `isGtfsStopsLoaded()` (from the stop index service) and `isRaptorLoaded()` (from the Raptor streaming service). It returns:
- `200 { status: "ok", gtfs: { stops: true, raptor: ... }, timestamp: ... }` when stops are loaded
- `503 { status: "degraded", gtfs: { stops: false, raptor: false }, timestamp: ... }` when stops have not loaded

This enables load-balancers and readiness probes to withhold traffic until data is ready.

---

### 5. Startup bootstrap

**File:** `backend/src/index.ts`

**Before:** `bootstrap()` loaded street data and started the HTTP server. Neither `loadGtfsStops()` nor `loadRaptorStreaming()` was called — the stop index was empty until a request triggered lazy loading (if any such trigger existed), and the Raptor planner was never initialised at all.

**After:**
- `loadGtfsStops()` is called eagerly before the server starts. Errors are caught and logged; the server still starts, but the health endpoint will report `503` until data is available.
- `loadRaptorStreaming()` is fired concurrently (non-blocking `Promise` with `.catch` handler). It can be slow (streaming large GTFS zips), so it runs in the background while the server is already accepting requests. `isRaptorLoaded()` reflects its state accurately.

---

## Startup Behaviour Changes

| Phase | Before | After |
|-------|--------|-------|
| Street data | Loaded at bootstrap | Unchanged |
| GTFS stops | Never loaded; lazy or absent | Loaded eagerly at bootstrap |
| Raptor planner | Never loaded | Loaded concurrently at bootstrap |
| Health endpoint | Always 200 "ok" | 503 "degraded" until stops loaded, then 200 "ok" |

---

## Failure Mode Improvements

| Failure mode | Before | After |
|---|---|---|
| Corrupt / missing GTFS zip | Silent: empty index, 200 health | Error logged + re-thrown; 503 health |
| Missing `stop_lat` column | Phantom stop at lat=0, lng=0 | Row skipped |
| Concurrent request during rebuild | Partial index returned | Full old index until swap completes |
| Server restart with bad GTFS | Empty index served as healthy | 503 until data is valid |
