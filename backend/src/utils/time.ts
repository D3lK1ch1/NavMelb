/**
 * Adds a number of seconds to a HH:MM:SS time string.
 * Handles day rollover (wraps at 24h).
 *
 * @param time - Base time in "HH:MM:SS" or "HH:MM" format
 * @param seconds - Seconds to add (may be fractional; rounded)
 * @returns Result time as "HH:MM:SS"
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
