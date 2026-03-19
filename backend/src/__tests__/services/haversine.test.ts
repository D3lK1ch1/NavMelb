import { describe, it, expect } from "vitest";
import { calculateDistance } from "../../services/route-map.service";

describe("calculateDistance (Haversine)", () => {
  it("Melbourne CBD → St Kilda ≈ 5.5km", () => {
    const cbd = { lat: -37.8136, lng: 144.9631 };
    const stKilda = { lat: -37.8676, lng: 144.9811 };
    const dist = calculateDistance(cbd, stKilda);
    expect(dist).toBeGreaterThan(5000);
    expect(dist).toBeLessThan(6500);
  });

  it("same point → 0m", () => {
    const point = { lat: -37.8136, lng: 144.9631 };
    expect(calculateDistance(point, point)).toBe(0);
  });

  it("Melbourne → Sydney ≈ 714km (sanity check)", () => {
    const melb = { lat: -37.8136, lng: 144.9631 };
    const syd = { lat: -33.8688, lng: 151.2093 };
    const dist = calculateDistance(melb, syd);
    expect(dist).toBeGreaterThan(700_000);
    expect(dist).toBeLessThan(730_000);
  });
});
