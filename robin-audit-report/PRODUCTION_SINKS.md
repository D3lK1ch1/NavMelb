# NavMelb Backend — Production Sinks Report

**Date:** 2026-05-06
**Scope:** Event routing to severity-classified log files

---

## Summary

Production file sinks have been added to route events from the event-sink architecture (created by `/add-events`) into append-only JSONL log files, classified by severity. This provides minimal production observability without requiring external logging infrastructure.

---

## Architecture

```
Business logic → dispatch(event) → registered sinks
                                      ├── file-sink (all envs): catastrophic → logs/catastrophic.log
                                      │                         high → logs/errors.log
                                      │                         info → (no file)
                                      └── console-sink (dev only): all events → stdout
```

The file sink is registered in **all environments** — catastrophic and high-severity events should always be captured, even in dev. The dev console sink provides info-level visibility separately.

---

## Severity Classification

| Event Type | Severity | Destination |
|-----------|----------|-------------|
| `infra.credentials_missing` | **CATASTROPHIC** | `logs/catastrophic.log` |
| `infra.missing_data` | **CATASTROPHIC** | `logs/catastrophic.log` |
| `destination.lookup.error` | high | `logs/errors.log` |
| `destination.lookup.not_found` | high | `logs/errors.log` |
| `stations.search.error` | high | `logs/errors.log` |
| `route.error` | high | `logs/errors.log` |
| `route.partial_failure` | high | `logs/errors.log` |
| `route.leg.ptv.failed` | high | `logs/errors.log` |
| `external.api.failed` | high | `logs/errors.log` |
| `ptv.route.origin_not_found` | high | `logs/errors.log` |
| `ptv.route.destination_not_found` | high | `logs/errors.log` |
| `destination.lookup.success` | info | stdout (dev) |
| `stations.search.success` | info | stdout (dev) |
| `distance.calculated` | info | stdout (dev) |
| `route.calculated` | info | stdout (dev) |
| `route.leg.ptv.success` | info | stdout (dev) |
| `route.leg.car.success` | info | stdout (dev) |
| `streets.search.success` | info | stdout (dev) |
| `streets.nearby.success` | info | stdout (dev) |
| `external.api.called` | info | stdout (dev) |
| `ptv.route.origin_found` | info | stdout (dev) |
| `ptv.route.destination_found` | info | stdout (dev) |
| `ptv.route.no_departures` | info | stdout (dev) |
| `ptv.route.success` | info | stdout (dev) |
| `ptv.route.no_matching_pattern` | info | stdout (dev) |

### Classification Rules

| Pattern | Severity | Rationale |
|---------|----------|-----------|
| `infra.credentials*`, `infra.missing*` | catastrophic | System cannot function |
| `*.error`, `*.failed`, `*.not_found`, `*partial_failure*` | high | Request-level failure, system still running |
| Everything else | info | Normal operation |

---

## Files Created

| File | Purpose |
|------|---------|
| `backend/src/events/classify-severity.ts` | Maps event type strings to severity levels |
| `backend/src/events/sinks/file-sink.ts` | Append-only JSONL file sink, routed by severity |

## Files Modified

| File | Change |
|------|--------|
| `backend/src/index.ts` | Registered file sink via `registerSink(createFileSink())` |
| `.gitignore` | Added `logs/` |

---

## Log Format

Each line is a self-contained JSON object (JSONL):

```json
{"type":"external.api.failed","service":"ptv","endpoint":"/v3/search","error":"ECONNREFUSED","_ts":"2026-05-06T08:15:32.123Z"}
```

The `_ts` field is the sink's write timestamp (when persisted), not the event creation time.

---

## Monitoring

```bash
# Live error stream
tail -f logs/errors.log | jq .

# Catastrophic events (should rarely fire)
tail -f logs/catastrophic.log | jq .

# Error count since last rotation
wc -l logs/errors.log

# Errors in the last hour
jq -r 'select(._ts > "2026-05-06T07:00:00")' logs/errors.log

# Most common error types
jq -r '.type' logs/errors.log | sort | uniq -c | sort -rn
```

---

## Design Decisions

- **Synchronous writes (`appendFileSync`)**: Catastrophic/high events are rare by definition. Sync guarantees the event is on disk before the process can crash, with no interleaving from concurrent requests.
- **JSONL format**: One JSON object per line. Parseable by `jq`, `tail -f`, Loki, Datadog, and any log ingestion tool.
- **No log rotation built in**: Rotation is an ops concern — use `logrotate` or equivalent.
- **Info events excluded from files**: High-throughput success events would fill disk quickly. They go to stdout in dev only.

---

## Recommendations

- Wire `logs/catastrophic.log` to an alerting system (inotifywait, Loki alert rule, etc.)
- Set up `logrotate` for `logs/errors.log` in production
- Consider adding request IDs to events for cross-event correlation
