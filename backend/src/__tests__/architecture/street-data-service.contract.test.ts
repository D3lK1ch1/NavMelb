/**
 * Contract test: services/street-data.service.ts public interface.
 */
import { describe, it, expect } from "vitest";
import * as streetDataModule from "../../services/street-data.service";

describe("street-data.service contract", () => {
  it("exports loadStreetData as a function", () => {
    expect(typeof streetDataModule.loadStreetData).toBe("function");
  });

  it("exports searchStreets as a function", () => {
    expect(typeof streetDataModule.searchStreets).toBe("function");
  });

  it("exports nearbyStreets as a function", () => {
    expect(typeof streetDataModule.nearbyStreets).toBe("function");
  });

  it("has exactly three exports", () => {
    const exports = Object.keys(streetDataModule).sort();
    expect(exports).toEqual(["loadStreetData", "nearbyStreets", "searchStreets"]);
  });

  describe("searchStreets", () => {
    it("returns an array when no data loaded", () => {
      const results = streetDataModule.searchStreets("flinders");
      expect(Array.isArray(results)).toBe(true);
    });

    it("each result has name, center, geometry properties", () => {
      // After empty load, results are [] — just verify the type shape if anything returns
      const results = streetDataModule.searchStreets("x");
      for (const r of results) {
        expect(r).toHaveProperty("name");
        expect(r).toHaveProperty("center");
        expect(r).toHaveProperty("geometry");
        expect(r.center).toHaveProperty("lat");
        expect(r.center).toHaveProperty("lng");
      }
    });
  });

  describe("nearbyStreets", () => {
    it("returns an array when no data loaded", () => {
      const results = streetDataModule.nearbyStreets({ lat: -37.8, lng: 144.9 });
      expect(Array.isArray(results)).toBe(true);
    });

    it("each result has name, center, geometry, distance", () => {
      const results = streetDataModule.nearbyStreets({ lat: -37.8, lng: 144.9 });
      for (const r of results) {
        expect(r).toHaveProperty("name");
        expect(r).toHaveProperty("center");
        expect(r).toHaveProperty("geometry");
        expect(r).toHaveProperty("distance");
      }
    });
  });
});
