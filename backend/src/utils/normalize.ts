/**
 * Normalises a stop/station name for consistent lookup and comparison.
 * Strips common suffixes (station, railway), collapses whitespace, lowercases.
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
