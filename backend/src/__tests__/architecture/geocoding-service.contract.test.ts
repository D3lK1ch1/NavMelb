/**
 * Contract test: services/geocoding.service.ts public interface.
 * This is a deep module — only one function is exported.
 */
import { describe, it, expect } from "vitest";
import * as geocodingModule from "../../services/geocoding.service";

describe("geocoding.service contract", () => {
  it("exports geocodeAddress as a function", () => {
    expect(typeof geocodingModule.geocodeAddress).toBe("function");
  });

  it("geocodeAddress is async (returns a Promise)", () => {
    // Don't actually call the network — just verify the return is thenable
    const result = geocodingModule.geocodeAddress("test");
    expect(result).toBeInstanceOf(Promise);
    // Clean up the pending promise
    result.catch(() => {});
  });

  it("has exactly one export", () => {
    const exports = Object.keys(geocodingModule);
    expect(exports).toEqual(["geocodeAddress"]);
  });
});
