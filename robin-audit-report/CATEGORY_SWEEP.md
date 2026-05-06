# Category Sweep — NavMelb Backend

## What Categorical Structures Were Found

The full analysis is in `category.tmp` (now deleted). Summary of genuine structures:

| Structure | Location | Status |
|-----------|----------|--------|
| Kleisli category of `Promise<T\|null>` | `route-map.service.ts`, `routes/route.ts`, `ptv-api.service.ts` | Present, informal |
| Functor CSV→Domain | `gtfs-stream.service.ts` | Well-formed |
| Functor wire→domain | `ptv-api.service.ts` | Well-formed |
| Functor domain→wire | `ApiResponse<T>` in `routes/route.ts` | Well-formed |
| Natural transformation String→String | `normalizeName` in 4 files | Fixed (4→1) |
| Natural transformation time format | `parseGtfsTime`/`timeToString` in 3 files | Fixed (scattered→`utils/time.ts`) |
| Kleisli sequencer | `chainJourneyLegs` in `route-map.service.ts` | Already correct |
| RAPTOR graph | `raptor-core.ts` | Already correct |
| Transfer graph | `gtfs-timetable.service.ts` | Already correct |

## What Was Fixed

### 2a. normalizeName extracted to `utils/normalize.ts`

Four copies in:
- `gtfs-stop-indexservice.ts` (had `\brailway\b` strip)
- `gtfs-timetable.service.ts` (had `\brailway\b` strip)
- `raptor-core.ts` (as `normalizeStopName`, private method, had `\brailway\b` strip)
- `gtfs-raptor-streaming.service.ts` (inline, had `\brailway\b` strip but missing second `replace(/\s+/g, " ")`)

The canonical version (from `gtfs-stop-indexservice.ts`) was chosen: it has both the `\bstation\b` and `\brailway\b` strips, plus a second whitespace collapse pass. All 4 callers now import from `utils/normalize`.

### 2b. `bindNullable` Kleisli helper created at `utils/kleisli.ts`

Not wired into existing call sites (per spec — those sites work correctly as-is). Available for future Kleisli chain composition.

### 2c. Time utilities extracted to `utils/time.ts`

Three scattered implementations unified:
- `parseGtfsTime` (was private in `gtfs-timetable.service.ts`) — canonical
- `timeToString` → renamed `formatGtfsTime` (was private in `gtfs-raptor-streaming.service.ts`)
- `addSecondsToTime` (was private in `route-map.service.ts`)
- `raptor-core.ts` private `parseTime` method — replaced with imported `parseGtfsTime`

One behavioral difference preserved: `gtfs-raptor-streaming.service.ts` used `9 * 3600` as the fallback for malformed times (9am, a reasonable transit default), while the canonical `parseGtfsTime` returns 0. The call site was updated to `parseGtfsTime(t) || 9 * 3600` to preserve this behavior.

## What Law Tests Were Written

Four test files in `backend/src/__tests__/categorical/`:

| File | Laws Tested |
|------|------------|
| `normalize.laws.test.ts` | Idempotence (`normalize(normalize(x)) === normalize(x)`) for 14 inputs; empty string identity; known transformations |
| `time.laws.test.ts` | Round-trip (`formatGtfsTime(parseGtfsTime(s)) === s`) for 8 valid times; edge cases; `addSecondsToTime` functional correctness |
| `kleisli.laws.test.ts` | Left identity, right identity, associativity for `bindNullable`; null short-circuit |
| `apiresponse.laws.test.ts` | Functor identity law, composition law for `ApiResponse<T>` via local `fmapApiResponse`; structural wrapping tests |

All 103 tests pass (42 pre-existing + 61 new categorical law tests).

## What Category Theory Can't Help With Here

- **Route quality**: Whether RAPTOR vs timetable service vs PTV live API gives better real-world results is a domain question. The RAPTOR and timetable engines are loaded at startup but never called from the route handlers — this integration gap requires a product decision, not a categorical one.
- **The `AVG_DWELL_SECONDS = 90` constant**: Engineering approximation. Category theory has nothing to say about whether 90s accurately models Melbourne train dwell times.
- **Performance of the O(n²) transfer graph build**: The categorical structure of the computation is clear (pairwise distance scan = adjacency relation), but whether the performance matters depends on data size.
- **Geocoding provider choice** (Nominatim vs Google Maps): Domain/cost tradeoff.
- **Error messages**: The 40+ inline error response objects in `route.ts` are a UX/API contract concern. The discriminated-union ApiResponse fix was deferred (would break all existing tests).
- **The LRU vs FIFO cache eviction issue** in `createBoundedCache`: Operationally important but not a categorical violation — it's a design choice. Deferred per spec.
