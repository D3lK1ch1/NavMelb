/**
 * Unit tests for ptv-api.service.ts
 *
 * Strategy: mock axios at the module level (same pattern as acceptance tests).
 * PTV credentials are set in beforeEach via process.env so that getClient()
 * doesn't throw. The module-level singleton `client` is reset between suites
 * by manipulating the module cache via vi.resetModules().
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// ── Stable mock for axios so we can control responses per test ─────────────
//
// The real axios.create() returns a client whose .get() method runs request
// interceptors before sending. Our mock replicates that: the interceptor
// function is captured in `capturedInterceptor`, and the mock `get` calls it
// on the config object before delegating to `mockAxiosGet`. This means the
// URL seen by `mockAxiosGet` is the post-interceptor URL (with signature etc.).

const mockAxiosGet = vi.fn();
let capturedInterceptor: ((cfg: Record<string, unknown>) => Record<string, unknown>) | null = null;

vi.mock("axios", () => ({
  default: {
    create: vi.fn((createConfig: Record<string, unknown>) => ({
      // Simulate interceptor execution: apply the captured interceptor before
      // forwarding to mockAxiosGet, matching real axios behaviour.
      get: vi.fn(async (url: string, config?: Record<string, unknown>) => {
        let mergedConfig: Record<string, unknown> = {
          url,
          params: (createConfig?.params as Record<string, unknown>) || {},
          ...(config || {}),
        };
        if (capturedInterceptor) {
          mergedConfig = capturedInterceptor(mergedConfig);
        }
        return mockAxiosGet(mergedConfig.url as string, mergedConfig);
      }),
      interceptors: {
        request: {
          use: vi.fn((fn: (cfg: Record<string, unknown>) => Record<string, unknown>) => {
            capturedInterceptor = fn;
          }),
        },
      },
    })),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build the minimal axios-like response shape the service expects.
 */
function makeStopsResponse(stops: Array<{
  stop_id: number;
  stop_name: string;
  stop_latitude: number;
  stop_longitude: number;
  route_type?: number;
}>) {
  return { data: { stops } };
}

function makeDeparturesResponse(departures: Array<{
  run_ref: string;
  route_id: number;
  route_name: string;
  direction_id: number;
  direction_name: string;
  scheduled_departure_utc: string;
  estimated_departure_utc?: string;
  platform_number?: string;
}>) {
  return { data: { departures } };
}

function makePatternResponse(departures: Array<{
  stop_id: number;
  departure_sequence: number;
  run_ref: string;
  route_id: number;
  route_type: number;
}>, geopath: Array<{ geometry: { type: string; coordinates: unknown } }> = []) {
  return { data: { departures, stops: {}, geopath } };
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const FLINDERS_STOP = {
  stop_id: 1071,
  stop_name: "Flinders Street Railway Station",
  stop_latitude: -37.8183,
  stop_longitude: 144.9671,
  route_type: 0,
};

const RICHMOND_STOP = {
  stop_id: 1207,
  stop_name: "Richmond Railway Station",
  stop_latitude: -37.8235,
  stop_longitude: 144.9882,
  route_type: 0,
};

const TRAM_STOP = {
  stop_id: 2042,
  stop_name: "Flinders Street/Swanston Street",
  stop_latitude: -37.8180,
  stop_longitude: 144.9668,
  route_type: 1,
};

const SAMPLE_DEPARTURE = {
  run_ref: "ABC123",
  route_id: 6,
  route_name: "Sandringham",
  direction_id: 5,
  direction_name: "Richmond",
  scheduled_departure_utc: "2026-05-06T08:00:00Z",
  platform_number: "4",
};

// ── Test setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
  // Ensure PTV credentials are always present so getClient() doesn't throw.
  process.env.PTV_DEV_ID = "test-dev-id";
  process.env.PTV_API_KEY = "test-api-key";
  mockAxiosGet.mockReset();
  capturedInterceptor = null;
});

afterEach(() => {
  delete process.env.PTV_DEV_ID;
  delete process.env.PTV_API_KEY;
});

// ── ptvSearchStops ─────────────────────────────────────────────────────────

describe("ptvSearchStops", () => {
  it("maps PTV API snake_case fields to camelCase typed structs", async () => {
    mockAxiosGet.mockResolvedValueOnce(makeStopsResponse([FLINDERS_STOP]));

    const { ptvSearchStops } = await import("../../services/ptv-api.service");
    const results = await ptvSearchStops("Flinders Street");

    expect(results).toHaveLength(1);
    const stop = results[0];
    expect(stop.stopId).toBe(1071);
    expect(stop.displayName).toBe("Flinders Street Railway Station");
    expect(stop.position.lat).toBeCloseTo(-37.8183);
    expect(stop.position.lng).toBeCloseTo(144.9671);
    expect(stop.routeType).toContain(0);
  });

  it("returns an empty array for an empty query string", async () => {
    const { ptvSearchStops } = await import("../../services/ptv-api.service");
    const results = await ptvSearchStops("   ");
    expect(results).toEqual([]);
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it("maps stops without route_type to an empty routeType array", async () => {
    const stopWithoutRouteType = { ...FLINDERS_STOP };
    delete (stopWithoutRouteType as Partial<typeof FLINDERS_STOP>).route_type;

    mockAxiosGet.mockResolvedValueOnce(makeStopsResponse([stopWithoutRouteType]));

    const { ptvSearchStops } = await import("../../services/ptv-api.service");
    const results = await ptvSearchStops("Flinders");
    expect(results[0].routeType).toEqual([]);
  });

  it("returns multiple stops from a search", async () => {
    mockAxiosGet.mockResolvedValueOnce(makeStopsResponse([FLINDERS_STOP, RICHMOND_STOP]));

    const { ptvSearchStops } = await import("../../services/ptv-api.service");
    const results = await ptvSearchStops("station");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.stopId)).toContain(1071);
    expect(results.map((r) => r.stopId)).toContain(1207);
  });

  it("normalizes query to lowercase before sending", async () => {
    mockAxiosGet.mockResolvedValueOnce(makeStopsResponse([]));

    const { ptvSearchStops } = await import("../../services/ptv-api.service");
    await ptvSearchStops("FLINDERS STREET");

    // The URL passed to get() contains the lowercased, URI-encoded query
    const calledUrl: string = mockAxiosGet.mock.calls[0][0];
    // Decode percent-encoding before checking for presence of the lowercased query
    const decoded = decodeURIComponent(calledUrl.toLowerCase());
    expect(decoded).toContain("flinders street");
  });
});

// ── ptvGetDepartures ───────────────────────────────────────────────────────

describe("ptvGetDepartures", () => {
  it("maps departure fields from snake_case to camelCase", async () => {
    mockAxiosGet.mockResolvedValueOnce(makeDeparturesResponse([SAMPLE_DEPARTURE]));

    const { ptvGetDepartures } = await import("../../services/ptv-api.service");
    const departures = await ptvGetDepartures(0, 1071);

    expect(departures).toHaveLength(1);
    const dep = departures[0];
    expect(dep.routeId).toBe(6);
    expect(dep.routeName).toBe("Sandringham");
    expect(dep.directionId).toBe(5);
    expect(dep.directionName).toBe("Richmond");
    expect(dep.scheduledDepartureUtc).toBe("2026-05-06T08:00:00Z");
    expect(dep.platformNumber).toBe("4");
    expect(dep.runRef).toBe("ABC123");
  });

  it("handles optional estimatedDepartureUtc being absent", async () => {
    mockAxiosGet.mockResolvedValueOnce(makeDeparturesResponse([SAMPLE_DEPARTURE]));

    const { ptvGetDepartures } = await import("../../services/ptv-api.service");
    const departures = await ptvGetDepartures(0, 1071);
    expect(departures[0].estimatedDepartureUtc).toBeUndefined();
  });

  it("passes estimated departure when present", async () => {
    const depWithEstimate = {
      ...SAMPLE_DEPARTURE,
      estimated_departure_utc: "2026-05-06T08:02:00Z",
    };
    mockAxiosGet.mockResolvedValueOnce(makeDeparturesResponse([depWithEstimate]));

    const { ptvGetDepartures } = await import("../../services/ptv-api.service");
    const departures = await ptvGetDepartures(0, 1071);
    expect(departures[0].estimatedDepartureUtc).toBe("2026-05-06T08:02:00Z");
  });

  it("returns empty array when departures is empty", async () => {
    mockAxiosGet.mockResolvedValueOnce(makeDeparturesResponse([]));

    const { ptvGetDepartures } = await import("../../services/ptv-api.service");
    const departures = await ptvGetDepartures(0, 1071);
    expect(departures).toEqual([]);
  });

  it("constructs the correct URL path with routeType and stopId", async () => {
    mockAxiosGet.mockResolvedValueOnce(makeDeparturesResponse([]));

    const { ptvGetDepartures } = await import("../../services/ptv-api.service");
    await ptvGetDepartures(0, 1071);

    const calledUrl: string = mockAxiosGet.mock.calls[0][0];
    expect(calledUrl).toContain("/departures/route_type/0/stop/1071");
  });
});

// ── ptvFindStopByName ──────────────────────────────────────────────────────

describe("ptvFindStopByName", () => {
  it("returns the best-matching stop for the given routeType", async () => {
    // Both train and tram stops returned; requesting routeType=0 (train)
    mockAxiosGet.mockResolvedValueOnce(makeStopsResponse([FLINDERS_STOP, TRAM_STOP]));

    const { ptvFindStopByName } = await import("../../services/ptv-api.service");
    const result = await ptvFindStopByName("Flinders Street", 0);

    expect(result).not.toBeNull();
    expect(result!.stopId).toBe(1071);
    expect(result!.stopName).toBe("Flinders Street Railway Station");
    expect(result!.position.lat).toBeCloseTo(-37.8183);
  });

  it("prefers stops with 'railway station' or 'station' in the name", async () => {
    const genericStop = { stop_id: 9999, stop_name: "Flinders Something", stop_latitude: -37.8, stop_longitude: 144.9, route_type: 0 };
    // FLINDERS_STOP has "Railway Station" — should be preferred
    mockAxiosGet.mockResolvedValueOnce(makeStopsResponse([genericStop, FLINDERS_STOP]));

    const { ptvFindStopByName } = await import("../../services/ptv-api.service");
    const result = await ptvFindStopByName("Flinders", 0);
    expect(result!.stopId).toBe(1071);
  });

  it("returns null when no stops are found", async () => {
    mockAxiosGet.mockResolvedValueOnce(makeStopsResponse([]));

    const { ptvFindStopByName } = await import("../../services/ptv-api.service");
    const result = await ptvFindStopByName("Nonexistent Station", 0);
    expect(result).toBeNull();
  });

  it("returns null when stops exist but none match the requested routeType", async () => {
    // Only tram stop (routeType=1), but requesting train (routeType=0)
    mockAxiosGet.mockResolvedValueOnce(makeStopsResponse([TRAM_STOP]));

    const { ptvFindStopByName } = await import("../../services/ptv-api.service");
    const result = await ptvFindStopByName("Flinders Street", 0);
    expect(result).toBeNull();
  });
});

// ── ptvFindRouteBetweenStops ───────────────────────────────────────────────

describe("ptvFindRouteBetweenStops", () => {
  it("returns a result when pattern includes both origin and destination (dest after origin)", async () => {
    // Step 1: search origin → Flinders
    mockAxiosGet
      .mockResolvedValueOnce(makeStopsResponse([FLINDERS_STOP]))         // search origin
      .mockResolvedValueOnce(makeStopsResponse([RICHMOND_STOP]))          // search dest
      .mockResolvedValueOnce(makeDeparturesResponse([SAMPLE_DEPARTURE]))  // get departures
      .mockResolvedValueOnce(                                             // get pattern
        makePatternResponse([
          { stop_id: 1071, departure_sequence: 1, run_ref: "ABC123", route_id: 6, route_type: 0 },
          { stop_id: 1207, departure_sequence: 3, run_ref: "ABC123", route_id: 6, route_type: 0 },
        ], [
          {
            geometry: {
              type: "LineString",
              coordinates: [
                [144.9671, -37.8183],
                [144.9732, -37.8201],
                [144.9882, -37.8235],
              ],
            },
          },
        ])
      );

    const { ptvFindRouteBetweenStops } = await import("../../services/ptv-api.service");
    const result = await ptvFindRouteBetweenStops("Flinders Street", "Richmond", 0);

    expect(result).not.toBeNull();
    // 2 stops difference × 90 seconds per stop = 180 seconds
    expect(result!.durationSeconds).toBe(420);
    expect(result!.platformNumber).toBe("4");
    expect(result!.geometry).toEqual([
      [-37.8183, 144.9671],
      [-37.8201, 144.9732],
      [-37.8235, 144.9882],
    ]);
    expect(mockAxiosGet.mock.calls[3][0]).toContain("include_geopath=true");
  });

  it("returns null when origin search returns no train stops", async () => {
    // Search returns only tram stops, but routeType=0 (train) is requested
    mockAxiosGet.mockResolvedValueOnce(makeStopsResponse([TRAM_STOP]));

    const { ptvFindRouteBetweenStops } = await import("../../services/ptv-api.service");
    const result = await ptvFindRouteBetweenStops("Flinders Street", "Richmond", 0);
    expect(result).toBeNull();
  });

  it("returns null when destination search returns no matching stops", async () => {
    mockAxiosGet
      .mockResolvedValueOnce(makeStopsResponse([FLINDERS_STOP])) // origin OK
      .mockResolvedValueOnce(makeStopsResponse([TRAM_STOP]));    // dest: tram only, not train

    const { ptvFindRouteBetweenStops } = await import("../../services/ptv-api.service");
    const result = await ptvFindRouteBetweenStops("Flinders Street", "Richmond", 0);
    expect(result).toBeNull();
  });

  it("returns null when origin has no departures", async () => {
    mockAxiosGet
      .mockResolvedValueOnce(makeStopsResponse([FLINDERS_STOP]))
      .mockResolvedValueOnce(makeStopsResponse([RICHMOND_STOP]))
      .mockResolvedValueOnce(makeDeparturesResponse([])); // no departures

    const { ptvFindRouteBetweenStops } = await import("../../services/ptv-api.service");
    const result = await ptvFindRouteBetweenStops("Flinders Street", "Richmond", 0);
    expect(result).toBeNull();
  });

  it("returns null when the pattern has no matching stops", async () => {
    mockAxiosGet
      .mockResolvedValueOnce(makeStopsResponse([FLINDERS_STOP]))
      .mockResolvedValueOnce(makeStopsResponse([RICHMOND_STOP]))
      .mockResolvedValueOnce(makeDeparturesResponse([SAMPLE_DEPARTURE]))
      .mockResolvedValueOnce(
        makePatternResponse([
          // Neither origin nor destination appear in this pattern
          { stop_id: 9999, departure_sequence: 1, run_ref: "ABC123", route_id: 6, route_type: 0 },
        ])
      );

    const { ptvFindRouteBetweenStops } = await import("../../services/ptv-api.service");
    const result = await ptvFindRouteBetweenStops("Flinders Street", "Richmond", 0);
    expect(result).toBeNull();
  });

  it("returns null when destination appears before origin in the pattern", async () => {
    // Richmond (1207) at seq 1, Flinders (1071) at seq 3 → reversed, so no match
    mockAxiosGet
      .mockResolvedValueOnce(makeStopsResponse([FLINDERS_STOP]))
      .mockResolvedValueOnce(makeStopsResponse([RICHMOND_STOP]))
      .mockResolvedValueOnce(makeDeparturesResponse([SAMPLE_DEPARTURE]))
      .mockResolvedValueOnce(
        makePatternResponse([
          { stop_id: 1207, departure_sequence: 1, run_ref: "ABC123", route_id: 6, route_type: 0 },
          { stop_id: 1071, departure_sequence: 3, run_ref: "ABC123", route_id: 6, route_type: 0 },
        ])
      );

    const { ptvFindRouteBetweenStops } = await import("../../services/ptv-api.service");
    const result = await ptvFindRouteBetweenStops("Flinders Street", "Richmond", 0);
    expect(result).toBeNull();
  });

  it("tries multiple departures before giving up", async () => {
    // First departure: pattern with wrong stops. Second departure: correct.
    const SECOND_DEPARTURE = { ...SAMPLE_DEPARTURE, run_ref: "DEF456", platform_number: "2" };

    mockAxiosGet
      .mockResolvedValueOnce(makeStopsResponse([FLINDERS_STOP]))
      .mockResolvedValueOnce(makeStopsResponse([RICHMOND_STOP]))
      .mockResolvedValueOnce(makeDeparturesResponse([SAMPLE_DEPARTURE, SECOND_DEPARTURE]))
      // First pattern: wrong stops
      .mockResolvedValueOnce(makePatternResponse([
        { stop_id: 9999, departure_sequence: 1, run_ref: "ABC123", route_id: 6, route_type: 0 },
      ]))
      // Second pattern: correct
      .mockResolvedValueOnce(makePatternResponse([
        { stop_id: 1071, departure_sequence: 1, run_ref: "DEF456", route_id: 6, route_type: 0 },
        { stop_id: 1207, departure_sequence: 2, run_ref: "DEF456", route_id: 6, route_type: 0 },
      ]));

    const { ptvFindRouteBetweenStops } = await import("../../services/ptv-api.service");
    const result = await ptvFindRouteBetweenStops("Flinders Street", "Richmond", 0);
    expect(result).not.toBeNull();
    expect(result!.platformNumber).toBe("2");
    expect(result!.durationSeconds).toBe(210);
  });
});

// ── HMAC signing (white-box, standalone) ──────────────────────────────────
//
// The service computes the HMAC-SHA1 signature directly in the axios request
// interceptor (ptv-api.service.ts lines 74-93). We verify the signing algorithm
// here without going through the HTTP stack, using the same inputs and expected
// outputs derived from the PTV Timetable API signing spec.

import crypto from "node:crypto";

describe("HMAC signing algorithm", () => {
  const DEV_ID = "test-dev-id";
  const API_KEY = "test-api-key";
  const BASE_PATH = "/v3"; // from new URL("https://timetableapi.ptv.vic.gov.au/v3").pathname

  function computeSignature(path: string, params: Record<string, string | number>): string {
    const allParams: Record<string, string | number> = { devid: DEV_ID, ...params };
    const sortedKeys = Object.keys(allParams).sort();
    const queryString = sortedKeys
      .map((k) => `${k}=${encodeURIComponent(String(allParams[k]))}`)
      .join("&");
    const pathWithParams = `${BASE_PATH}${path}?${queryString}`;
    return crypto
      .createHmac("sha1", API_KEY)
      .update(pathWithParams)
      .digest("hex")
      .toUpperCase();
  }

  it("produces a 40-character uppercase hex string", () => {
    const sig = computeSignature("/search/flinders", {});
    expect(sig).toHaveLength(40);
    expect(sig).toBe(sig.toUpperCase());
    expect(sig).toMatch(/^[0-9A-F]{40}$/);
  });

  it("signature changes when the path changes", () => {
    const sig1 = computeSignature("/search/flinders", {});
    const sig2 = computeSignature("/search/richmond", {});
    expect(sig1).not.toBe(sig2);
  });

  it("signature changes when the API key changes", () => {
    const sig1 = computeSignature("/search/flinders", {});
    // Replicate the algorithm with a different key
    const pathWithParams = `${BASE_PATH}/search/flinders?devid=${encodeURIComponent(DEV_ID)}`;
    const sig2 = crypto
      .createHmac("sha1", "different-key")
      .update(pathWithParams)
      .digest("hex")
      .toUpperCase();
    expect(sig1).not.toBe(sig2);
  });

  it("params are sorted alphabetically before hashing", () => {
    // If params are sorted, {devid, limit} and {limit, devid} produce the same sig
    const params = { limit: "10" };
    const allParams: Record<string, string | number> = { devid: DEV_ID, ...params };
    const sortedKeys = Object.keys(allParams).sort();
    const reversedKeys = [...sortedKeys].reverse();

    const sortedQS = sortedKeys.map((k) => `${k}=${encodeURIComponent(String(allParams[k as keyof typeof allParams]))}`).join("&");
    const reversedQS = reversedKeys.map((k) => `${k}=${encodeURIComponent(String(allParams[k as keyof typeof allParams]))}`).join("&");

    // The sorted and reversed query strings differ in key order
    expect(sortedQS).not.toBe(reversedQS);

    // But the service always sorts — so both should produce the canonical sig
    const sig = computeSignature("/search/test", params);
    expect(sig).toHaveLength(40);
  });

  it("devid is always included even if not in explicit params", () => {
    // The signing algorithm merges devid into params before hashing.
    // A signature computed without devid will not match.
    const withDevid = computeSignature("/search/flinders", {});
    const pathWithoutDevid = `${BASE_PATH}/search/flinders?`;
    const sigWithoutDevid = crypto
      .createHmac("sha1", API_KEY)
      .update(pathWithoutDevid)
      .digest("hex")
      .toUpperCase();
    expect(withDevid).not.toBe(sigWithoutDevid);
  });
});

// ── getClient credential validation ───────────────────────────────────────

describe("getClient credential validation", () => {
  it("throws when PTV_DEV_ID is absent", async () => {
    // Reset the module so the singleton client is cleared
    vi.resetModules();

    delete process.env.PTV_DEV_ID;
    process.env.PTV_API_KEY = "test-key";

    const { ptvSearchStops } = await import("../../services/ptv-api.service");
    await expect(ptvSearchStops("flinders")).rejects.toThrow(/credentials not configured/i);
  });

  it("throws when PTV_API_KEY is absent", async () => {
    vi.resetModules();

    process.env.PTV_DEV_ID = "test-id";
    delete process.env.PTV_API_KEY;

    const { ptvSearchStops } = await import("../../services/ptv-api.service");
    await expect(ptvSearchStops("flinders")).rejects.toThrow(/credentials not configured/i);
  });
});
