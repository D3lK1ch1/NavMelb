/**
 * Contract test: utils/normalize.ts public interface.
 * If this test fails, the module's public API has changed.
 */
import { describe, it, expect } from "vitest";
import * as normalizeModule from "../../utils/normalize";

describe("utils/normalize contract", () => {
  it("exports normalizeName as a function", () => {
    expect(typeof normalizeModule.normalizeName).toBe("function");
  });

  it("normalizeName(string) → string", () => {
    const result = normalizeModule.normalizeName("Flinders Street Station");
    expect(typeof result).toBe("string");
  });

  it("normalizeName strips 'station' suffix", () => {
    expect(normalizeModule.normalizeName("Flinders Street Station")).toBe("flinders street");
  });

  it("normalizeName strips 'railway' suffix", () => {
    expect(normalizeModule.normalizeName("Footscray Railway Station")).toBe("footscray");
  });

  it("normalizeName lowercases and trims", () => {
    expect(normalizeModule.normalizeName("  RICHMOND  ")).toBe("richmond");
  });

  it("normalizeName collapses internal whitespace", () => {
    expect(normalizeModule.normalizeName("South  Yarra")).toBe("south yarra");
  });

  it("is the only export", () => {
    const exports = Object.keys(normalizeModule);
    expect(exports).toEqual(["normalizeName"]);
  });
});
