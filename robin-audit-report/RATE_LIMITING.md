# Rate Limiting Audit Report

## What Was Added

### 1. `express-rate-limit` middleware (60 req/min per IP)

Applied to all `/api` routes in `backend/src/app.ts`. Uses an in-memory store (default `MemoryStore`), which is appropriate for a single-process deployment. Configuration:

| Parameter | Value | Rationale |
|---|---|---|
| `windowMs` | 60 000 ms (1 minute) | Standard sliding window; aligns with "per minute" UX expectations |
| `max` | 60 (production) / 10 000 (test) | 1 req/s average gives headroom for bursts while blocking abuse |
| `standardHeaders` | `true` | Emits `RateLimit-*` headers per RFC 9110 draft |
| `legacyHeaders` | `false` | Suppresses deprecated `X-RateLimit-*` headers |

When the limit is exceeded the handler returns HTTP 429 with the existing error envelope:

```json
{
  "success": false,
  "error": "Too many requests, please try again later",
  "timestamp": "2026-05-06T08:43:00.000Z"
}
```

### 2. Explicit body size limit on the JSON parser

`express.json()` now specifies `{ limit: "16kb" }`. The previous default (100 KB) is unnecessarily large for coordinate/transit payloads (typical request is < 1 KB). Oversized bodies now receive HTTP 413 automatically from Express before reaching route handlers.

## How It Affects Tests

The test helper (`backend/src/__tests__/helpers/create-app.ts`) calls `createApp()` directly. To prevent tests from tripping the rate limit, the limiter's `max` is set to `10 000` when `NODE_ENV=test`. This is set before the vitest run (`NODE_ENV=test npx vitest run`) and confirmed by all 42 existing tests passing without modification.

No test files were changed.
