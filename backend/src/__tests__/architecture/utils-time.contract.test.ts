/**
 * Contract test: utils/time.ts public interface.
 * If this test fails, the module's public API has changed.
 */
import { describe, it, expect } from "vitest";
import * as timeModule from "../../utils/time";

describe("utils/time contract", () => {
  it("exports addSecondsToTime as a function", () => {
    expect(typeof timeModule.addSecondsToTime).toBe("function");
  });

  it("addSecondsToTime(string, number) → string in HH:MM:SS format", () => {
    const result = timeModule.addSecondsToTime("08:00:00", 3600);
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("adds seconds correctly", () => {
    expect(timeModule.addSecondsToTime("08:00:00", 3600)).toBe("09:00:00");
    expect(timeModule.addSecondsToTime("23:30:00", 1800)).toBe("00:00:00");
    expect(timeModule.addSecondsToTime("00:00:00", 90)).toBe("00:01:30");
  });

  it("handles HH:MM input without seconds", () => {
    const result = timeModule.addSecondsToTime("08:00", 60);
    expect(result).toBe("08:01:00");
  });

  it("rounds fractional seconds", () => {
    const result = timeModule.addSecondsToTime("00:00:00", 90.7);
    expect(result).toBe("00:01:31");
  });

  it("is the only export", () => {
    const exports = Object.keys(timeModule);
    expect(exports).toEqual(["addSecondsToTime"]);
  });
});
