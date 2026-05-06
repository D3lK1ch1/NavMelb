/**
 * Law tests for normalizeName (utils/normalize.ts).
 *
 * normalizeName is a morphism in the category of String-processing functions.
 * It should satisfy:
 *   1. Idempotence: normalize(normalize(x)) === normalize(x) for all x
 *   2. Identity on empty string: normalize("") === ""
 */
import { describe, it, expect } from "vitest";
import { normalizeName } from "../../utils/normalize";

describe("normalizeName — categorical laws", () => {
  const testCases = [
    "Flinders Street Station",
    "Southern Cross Station",
    "Richmond Railway Station",
    "Melbourne Central",
    "Flagstaff",
    "  North  Melbourne   Station  ",
    "SOUTHERN CROSS",
    "",
    "Dandenong",
    "Ringwood Station",
    "Camberwell Railway Station",
    "station",
    "railway",
    "  station  railway  ",
  ];

  describe("idempotence: normalize(normalize(x)) === normalize(x)", () => {
    for (const name of testCases) {
      it(`is idempotent for: "${name}"`, () => {
        const once = normalizeName(name);
        const twice = normalizeName(once);
        expect(twice).toBe(once);
      });
    }
  });

  describe("identity on empty string", () => {
    it('normalizeName("") === ""', () => {
      expect(normalizeName("")).toBe("");
    });
  });

  describe("known transformations", () => {
    it("lowercases and strips 'Station'", () => {
      expect(normalizeName("Flinders Street Station")).toBe("flinders street");
    });

    it("strips 'Railway'", () => {
      expect(normalizeName("Camberwell Railway Station")).toBe("camberwell");
    });

    it("collapses whitespace", () => {
      // "North  Melbourne  Station" → lowercase → strip "station" → collapse spaces
      expect(normalizeName("North  Melbourne  Station")).toBe("north melbourne");
    });

    it("trims leading/trailing whitespace", () => {
      const result = normalizeName("  Flinders Street Station  ");
      expect(result.startsWith(" ")).toBe(false);
      expect(result.endsWith(" ")).toBe(false);
    });
  });
});
