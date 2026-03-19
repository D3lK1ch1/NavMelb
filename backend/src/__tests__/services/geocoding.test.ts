import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock axios before importing the module under test
vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

import { geocodeAddress } from "../../services/geocoding.service";
import axios from "axios";

const mockGet = vi.mocked(axios.get);

describe("geocoding service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns coordinates for a successful geocode", async () => {
    mockGet.mockResolvedValueOnce({
      data: [{ lat: "-37.818", lon: "144.969", display_name: "Federation Square" }],
    } as never);

    const result = await geocodeAddress("Federation Square");
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(-37.818, 2);
    expect(result!.lng).toBeCloseTo(144.969, 2);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("cache hit does not call axios again", async () => {
    // The first call from the previous test should have cached the result,
    // but since we're in a separate test we need to prime the cache first
    mockGet.mockResolvedValueOnce({
      data: [{ lat: "-37.818", lon: "144.969" }],
    } as never);

    await geocodeAddress("cache test location");
    expect(mockGet).toHaveBeenCalledTimes(1);

    // Second call should hit cache
    const result = await geocodeAddress("cache test location");
    expect(result).not.toBeNull();
    expect(mockGet).toHaveBeenCalledTimes(1); // Still 1 — no new call
  });
});
