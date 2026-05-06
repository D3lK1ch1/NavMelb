/**
 * Canonical station name normalization.
 *
 * This is the single natural transformation String → String for all GTFS stop
 * name lookups in the codebase. It was previously copy-pasted into four files:
 *   - gtfs-stop-indexservice.ts
 *   - gtfs-timetable.service.ts
 *   - raptor-core.ts (as normalizeStopName)
 *   - gtfs-raptor-streaming.service.ts (inline)
 *
 * Properties:
 *   - Idempotent: normalizeName(normalizeName(x)) === normalizeName(x)
 *   - Preserves empty string: normalizeName("") === ""
 */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bstation\b/g, "")
    .replace(/\brailway\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
