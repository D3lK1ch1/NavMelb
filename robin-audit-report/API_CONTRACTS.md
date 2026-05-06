# API Contract Fixes — NavMelb Backend

## What Was Fixed

### 1. Filter-before-slice in `/stations/search`

**Problem:** The original code called `.slice(0, limit)` before `.filter()`. This meant that if `limit=5` and `transportType=train` was specified, the slice would cut to 5 results from the raw PTV response, and then the train filter might leave fewer than 5 (or zero) results.

**Fix:** Moved the `filter()` step before `slice()`. The full PTV result set is filtered first, then sliced to the limit. `total` reflects the count after filtering, before slicing.

### 2. Pagination metadata on list endpoints

Added `total` and `truncated` to the top-level response body (alongside `success`, `data`, `timestamp`) on all three list endpoints:

- `GET /stations/search`
- `GET /streets/search`
- `GET /streets/nearby`

For `/streets/search` and `/streets/nearby`, the service functions were called with `Infinity` as the limit so the route handler can compute the pre-slice total correctly before slicing to the requested limit.

### 3. `failedLegs` count on `/route/calculate`

**Problem:** 207 consumers had to walk the `segments[]` array and count `type === "failed"` entries themselves.

**Fix:** Added `failedLegs: number` to the `RouteResult` response. It is also used internally to determine whether to return 207, removing the redundant `.some()` call.

The field is also added as optional (`failedLegs?: number`) to the `RouteResult` type in `backend/src/types/index.ts`.

---

## Response Shape Changes

### `/stations/search` (before)

```json
{
  "success": true,
  "data": [...],
  "timestamp": "..."
}
```

### `/stations/search` (after)

```json
{
  "success": true,
  "data": [...],
  "total": 12,
  "truncated": true,
  "timestamp": "..."
}
```

Same shape change applies to `/streets/search` and `/streets/nearby`.

### `/route/calculate` (before)

```json
{
  "success": true,
  "data": {
    "segments": [...],
    "totalDistance": 5000,
    "totalDuration": 1200,
    "estimatedArrival": "...",
    "departureInfo": [...]
  },
  "timestamp": "..."
}
```

### `/route/calculate` (after)

```json
{
  "success": true,
  "data": {
    "segments": [...],
    "totalDistance": 5000,
    "totalDuration": 1200,
    "estimatedArrival": "...",
    "departureInfo": [...],
    "failedLegs": 0
  },
  "timestamp": "..."
}
```

---

## Breaking Change Assessment

- **`total` and `truncated`** are additive new fields on the response root. Existing consumers that only read `data` are unaffected. Non-breaking.
- **`failedLegs`** is a new field inside `data`. Existing consumers that don't read it are unaffected. Non-breaking.
- **Filter-before-slice** changes the _count_ of results returned when `transportType` is combined with `limit`. Consumers relying on the old (buggy) behavior of getting up to `limit` unfiltered results then seeing fewer after filtering would get different counts. This is a correctness fix, not a regression.

All 42 existing tests pass.
