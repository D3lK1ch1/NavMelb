import { describe, it, expect, beforeAll, vi, afterAll } from "vitest";
import { getNextDepartureTime, loadGtfsTimetables } from "../../services/gtfs-timetable.service";
import path from "path";

describe("GTFS timetable service", () => {
  beforeAll(async () => {
    process.env.GTFS_ROOT = path.join(__dirname, "..", "fixtures", "gtfs");
    await loadGtfsTimetables();
  });

  it("returns next departure after pinned time", () => {
    vi.useFakeTimers();
    // Set time to 7:55 AM — next train departure from Flinders St is T1 at 08:00
    vi.setSystemTime(new Date("2026-03-19T07:55:00"));

    const departure = getNextDepartureTime("Flinders Street Station");
    expect(departure).not.toBeNull();
    expect(departure!.time).toBe("08:00:00");
    expect(departure!.waitMinutes).toBeLessThanOrEqual(5);

    vi.useRealTimers();
  });

  it("returns null when no departures remain", () => {
    vi.useFakeTimers();
    // Set time to 23:00 — no departures after this in our fixture
    vi.setSystemTime(new Date("2026-03-19T23:00:00"));

    const departure = getNextDepartureTime("Flinders Street Station");
    expect(departure).toBeNull();

    vi.useRealTimers();
  });
});
