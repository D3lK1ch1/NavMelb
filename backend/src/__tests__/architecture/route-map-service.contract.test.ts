/**
 * Contract test: services/route-map.service.ts public interface post-cleanup.
 * Dead exports (calculateDistance, lookupDestination, chainJourneyLegs, calculateMultiStopRoute)
 * must NOT appear here. If they do, the dead code was accidentally re-introduced.
 */
import { describe, it, expect } from "vitest";
import * as routeMapModule from "../../services/route-map.service";

describe("route-map.service contract", () => {
  const EXPECTED_EXPORTS = ["lookupDestinationAny", "osrmRoute", "getPTVRoute"].sort();

  it("exports lookupDestinationAny as a function", () => {
    expect(typeof routeMapModule.lookupDestinationAny).toBe("function");
  });

  it("exports osrmRoute as a function", () => {
    expect(typeof routeMapModule.osrmRoute).toBe("function");
  });

  it("exports getPTVRoute as a function", () => {
    expect(typeof routeMapModule.getPTVRoute).toBe("function");
  });

  it("does NOT export calculateDistance (passthrough deleted)", () => {
    expect((routeMapModule as Record<string, unknown>)["calculateDistance"]).toBeUndefined();
  });

  it("does NOT export lookupDestination (passthrough deleted)", () => {
    expect((routeMapModule as Record<string, unknown>)["lookupDestination"]).toBeUndefined();
  });

  it("does NOT export chainJourneyLegs (dead code deleted)", () => {
    expect((routeMapModule as Record<string, unknown>)["chainJourneyLegs"]).toBeUndefined();
  });

  it("does NOT export calculateMultiStopRoute (dead code deleted)", () => {
    expect((routeMapModule as Record<string, unknown>)["calculateMultiStopRoute"]).toBeUndefined();
  });

  it("has exactly the expected public exports", () => {
    const actual = Object.keys(routeMapModule).sort();
    expect(actual).toEqual(EXPECTED_EXPORTS);
  });
});
