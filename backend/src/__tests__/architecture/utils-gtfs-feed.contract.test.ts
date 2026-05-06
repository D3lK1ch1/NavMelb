/**
 * Contract test: utils/gtfs-feed.ts public interface.
 * If this test fails, the module's public API has changed.
 */
import { describe, it, expect } from "vitest";
import * as gtfsFeedModule from "../../utils/gtfs-feed";

describe("utils/gtfs-feed contract", () => {
  it("exports getTransportType as a function", () => {
    expect(typeof gtfsFeedModule.getTransportType).toBe("function");
  });

  it("exports resolveGtfsRoot as a function", () => {
    expect(typeof gtfsFeedModule.resolveGtfsRoot).toBe("function");
  });

  describe("getTransportType", () => {
    it("maps feed dir numbers to transport types", () => {
      expect(gtfsFeedModule.getTransportType("1")).toBe("train");
      expect(gtfsFeedModule.getTransportType("2")).toBe("train");
      expect(gtfsFeedModule.getTransportType("10")).toBe("train");
      expect(gtfsFeedModule.getTransportType("3")).toBe("tram");
      expect(gtfsFeedModule.getTransportType("4")).toBe("bus");
      expect(gtfsFeedModule.getTransportType("5")).toBe("bus");
      expect(gtfsFeedModule.getTransportType("11")).toBe("bus");
    });

    it("returns 'bus' for unknown feed dirs", () => {
      expect(gtfsFeedModule.getTransportType("99")).toBe("bus");
      expect(gtfsFeedModule.getTransportType("unknown")).toBe("bus");
    });

    it("handles folder names with non-numeric prefixes", () => {
      // e.g. "3-tram" → folderNum "3" → tram
      expect(gtfsFeedModule.getTransportType("3-tram")).toBe("tram");
      expect(gtfsFeedModule.getTransportType("1-train")).toBe("train");
    });
  });

  describe("resolveGtfsRoot", () => {
    it("throws when GTFS_ROOT does not exist", () => {
      const orig = process.env.GTFS_ROOT;
      process.env.GTFS_ROOT = "/nonexistent/path/to/gtfs";
      expect(() => gtfsFeedModule.resolveGtfsRoot()).toThrow(/GTFS root not found/);
      process.env.GTFS_ROOT = orig;
    });

    it("returns a string when GTFS_ROOT exists", () => {
      // Point at the fixtures directory which exists
      const path = require("path");
      process.env.GTFS_ROOT = path.join(__dirname, "../fixtures/gtfs");
      const result = gtfsFeedModule.resolveGtfsRoot();
      expect(typeof result).toBe("string");
      delete process.env.GTFS_ROOT;
    });
  });

  it("exports exactly getTransportType and resolveGtfsRoot", () => {
    const exports = Object.keys(gtfsFeedModule).sort();
    expect(exports).toEqual(["getTransportType", "resolveGtfsRoot"]);
  });
});
