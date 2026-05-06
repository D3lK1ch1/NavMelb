/**
 * Canonical GTFS time utilities.
 *
 * GTFS times are seconds-since-midnight integers. Times past midnight (e.g.,
 * 25:30:00) are valid in GTFS for trips that continue past midnight on the
 * same service day.
 *
 * These functions were previously scattered across:
 *   - gtfs-timetable.service.ts  (parseGtfsTime, private)
 *   - gtfs-raptor-streaming.service.ts (parseTime, timeToString, private)
 *   - raptor-core.ts (parseTime, private method)
 *   - route-map.service.ts (addSecondsToTime, private)
 *
 * Round-trip property: formatGtfsTime(parseGtfsTime(s)) === s for valid HH:MM:SS.
 */

/**
 * Parse a GTFS time string ("HH:MM:SS") to seconds since midnight.
 * Returns 0 for invalid/empty input.
 */
export function parseGtfsTime(time: string): number {
  if (!time || time.length < 5) return 0;
  const [h, m, s] = time.split(":").map(Number);
  return (isNaN(h) ? 0 : h) * 3600 + (isNaN(m) ? 0 : m) * 60 + (isNaN(s) ? 0 : s);
}

/**
 * Format seconds since midnight as a GTFS time string ("HH:MM:SS").
 * Does not wrap at 24h — GTFS allows times like "25:30:00".
 */
export function formatGtfsTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Add a duration (in seconds) to a GTFS time string, returning a new time string.
 * Wraps hours at 24 for display purposes (use formatGtfsTime if you need to
 * preserve GTFS semantics across midnight).
 */
export function addSecondsToTime(time: string, seconds: number): string {
  const parts = time.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  const total = h * 3600 + m * 60 + s + Math.round(seconds);
  const hh = Math.floor(total / 3600) % 24;
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
