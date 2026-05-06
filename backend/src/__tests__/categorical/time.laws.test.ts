/**
 * Law tests for time utilities (utils/time.ts).
 *
 * parseGtfsTime and formatGtfsTime are inverses on valid GTFS time strings.
 * Round-trip property: formatGtfsTime(parseGtfsTime(s)) === s for valid HH:MM:SS.
 */
import { describe, it, expect } from "vitest";
import { parseGtfsTime, formatGtfsTime, addSecondsToTime } from "../../utils/time";

describe("GTFS time utilities — categorical laws", () => {
  const validTimes = [
    "00:00:00",
    "09:30:00",
    "12:00:00",
    "17:45:30",
    "23:59:59",
    "24:00:00", // GTFS allows times past midnight
    "25:30:00",
    "00:00:01",
  ];

  describe("round-trip: formatGtfsTime(parseGtfsTime(s)) === s", () => {
    for (const t of validTimes) {
      it(`round-trips: "${t}"`, () => {
        const seconds = parseGtfsTime(t);
        const formatted = formatGtfsTime(seconds);
        expect(formatted).toBe(t);
      });
    }
  });

  describe("parseGtfsTime — edge cases", () => {
    it("returns 0 for empty string", () => {
      expect(parseGtfsTime("")).toBe(0);
    });

    it("returns 0 for short string", () => {
      expect(parseGtfsTime("9:0")).toBe(0);
    });

    it("correctly parses midnight (86400 seconds)", () => {
      expect(parseGtfsTime("24:00:00")).toBe(86400);
    });

    it("correctly parses 09:30:00 = 34200 seconds", () => {
      expect(parseGtfsTime("09:30:00")).toBe(9 * 3600 + 30 * 60);
    });
  });

  describe("formatGtfsTime — structure", () => {
    it("produces HH:MM:SS format", () => {
      const result = formatGtfsTime(3661); // 1h 1m 1s
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(result).toBe("01:01:01");
    });

    it("pads single digits with zeros", () => {
      expect(formatGtfsTime(0)).toBe("00:00:00");
    });

    it("does not wrap hours at 24 (GTFS semantics)", () => {
      expect(formatGtfsTime(86400)).toBe("24:00:00");
      expect(formatGtfsTime(90000)).toBe("25:00:00");
    });
  });

  describe("addSecondsToTime — functional correctness", () => {
    it("adds 3600 seconds (1 hour) to a time", () => {
      expect(addSecondsToTime("09:00:00", 3600)).toBe("10:00:00");
    });

    it("handles second overflow into minutes", () => {
      expect(addSecondsToTime("09:00:00", 90)).toBe("09:01:30");
    });

    it("wraps hours at 24 (display semantics)", () => {
      expect(addSecondsToTime("23:00:00", 7200)).toBe("01:00:00");
    });

    it("adding 0 seconds is identity", () => {
      const t = "14:30:00";
      expect(addSecondsToTime(t, 0)).toBe(t);
    });
  });
});
