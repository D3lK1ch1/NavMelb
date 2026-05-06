# CLI Smoke Test — NavMelb Backend

## Overview

`backend/src/cli.ts` is a zero-dependency smoke-test script that exercises every HTTP endpoint
exposed by the NavMelb backend.  It is designed to run after deployment or server startup to
confirm the API is alive and returning sensible structures.

## Usage

```bash
# Start the server first
cd backend && npm run dev

# In another terminal, from the backend/ directory:
npm run smoke

# Options
npm run smoke -- --verbose
npm run smoke -- --url http://staging-host:3000
npm run smoke -- --url http://localhost:3000 --verbose
```

Or directly via ts-node:

```bash
npx ts-node src/cli.ts [--url <base-url>] [--verbose]
```

## What It Tests

| # | Method | Path | Melbourne test data | Validation |
|---|--------|------|---------------------|------------|
| 1 | GET | `/health` | — | `status === "ok"` |
| 2 | GET | `/api/map/destination/lookup?query=Federation+Square` | Federation Square | `success: true`, response has `{lat, lng}` |
| 3 | POST | `/api/map/distance` | CBD `(-37.8136, 144.9631)` → St Kilda `(-37.8676, 144.9811)` | `success: true`, `data.distance > 0` |
| 4 | GET | `/api/map/stations/search?query=flinders` | — | `success: true`, `data` array length > 0 |
| 5 | POST | `/api/map/route/calculate` | CBD → Fitzroy, strategy: `car` | `success: true`, `data.segments` is array |
| 6 | GET | `/api/map/streets/search?query=Flinders` | — | `success: true`, `data` is array |
| 7 | GET | `/api/map/streets/nearby?lat=-37.8183&lng=144.9671&radius=500` | Near Flinders St station | `success: true`, `data` is array |

## Sample Output

```
NavMelb Smoke Test
==================
Target: http://localhost:3000

 ✓ GET  /health                          200  12ms    → status: "ok"
 ✓ GET  /api/map/destination/lookup      200  342ms   → Federation Square found (-37.8183, 144.9671)
 ✓ POST /api/map/distance                200  3ms     → 6.89km (CBD → St Kilda)
 ✓ GET  /api/map/stations/search         200  89ms    → 5 stations found
 ✓ POST /api/map/route/calculate         200  1.2s    → 1 segment(s), 3.2km
 ✓ GET  /api/map/streets/search          200  15ms    → 8 streets found
 ✓ GET  /api/map/streets/nearby          200  22ms    → 12 nearby streets

  Event log: 0 new errors (logs/errors.log)

  7/7 passed
```

## Validation Philosophy

The tool validates *structure*, not *values*. PTV data and street data are live, so it only
checks that:
- HTTP status is 2xx (200 or 207 for partial PTV routes)
- `success === true` in the response envelope
- The `data` field has the expected shape (e.g. contains `lat`/`lng`, is an array, etc.)

This keeps the test stable across Melbourne geographic updates and live transit timetable changes.

## Error Log Integration

If `logs/errors.log` exists (created when the event-sink system is active), the tool:
1. Snapshots the file size at startup
2. After all requests, checks if new bytes were appended
3. Reports how many new error lines were logged during the test run
4. In `--verbose` mode, prints the new lines

This integrates with the event-sink PR (`feat/production-sinks`) without requiring it — if
the log file is absent, this step is silently skipped.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All checks passed |
| `1` | One or more checks failed, or a fatal error occurred |

This makes `npm run smoke` composable in CI pipelines and deployment scripts:

```bash
npm run smoke || { echo "Smoke test failed — rolling back"; ./rollback.sh; }
```

## Implementation Notes

- **Zero new dependencies**: uses Node 18+ built-in `fetch` and the `fs`/`path` standard library.
- **Inline ANSI colors**: no `chalk` or `colors` package needed.
- **Manual arg parsing**: no `yargs`/`commander` — the flag surface is deliberately small.
- **Single file**: `backend/src/cli.ts` — nothing to maintain elsewhere.
