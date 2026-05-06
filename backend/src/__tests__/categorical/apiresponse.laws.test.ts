/**
 * Structural tests for ApiResponse as a functor in T.
 *
 * ApiResponse<T> = { success: true; data: T; timestamp: string }
 *                | { success: false; error: string; timestamp: string }
 *
 * The data field makes this a functor in T: fmap f resp maps f over the data
 * field while leaving success and timestamp unchanged.
 *
 * Functor laws:
 *   1. Identity:     fmap id x === x
 *   2. Composition:  fmap (g ∘ f) x === fmap g (fmap f x)
 *
 * These are structural tests — they verify the shape of the wrapping pattern
 * used in routes/route.ts rather than importing a formal fmap.
 */
import { describe, it, expect } from "vitest";

// Minimal ApiResponse type mirroring what routes/route.ts produces.
type ApiSuccess<T> = { success: true; data: T; timestamp: string };
type ApiError = { success: false; error: string; timestamp: string };
type ApiResponse<T> = ApiSuccess<T> | ApiError;

// Canonical construction helpers (mirroring the route handler pattern).
function apiSuccess<T>(data: T): ApiSuccess<T> {
  return { success: true, data, timestamp: new Date().toISOString() };
}

function apiError(error: string): ApiError {
  return { success: false, error, timestamp: new Date().toISOString() };
}

// The functor map: applies f to the data field if success, passes error through.
function fmapApiResponse<A, B>(
  resp: ApiResponse<A>,
  f: (a: A) => B
): ApiResponse<B> {
  if (!resp.success) return resp as ApiError;
  return { ...resp, data: f(resp.data) };
}

describe("ApiResponse — functor laws", () => {
  describe("identity law: fmap id === id", () => {
    it("identity on success response preserves data", () => {
      const original = apiSuccess(42);
      const mapped = fmapApiResponse(original, (x) => x);
      expect(mapped).toEqual({ ...original });
    });

    it("identity on error response passes through unchanged", () => {
      const original = apiError("Not found");
      const mapped = fmapApiResponse(original, (x: never) => x);
      expect(mapped).toEqual(original);
    });
  });

  describe("composition law: fmap (g ∘ f) === fmap g ∘ fmap f", () => {
    const f = (n: number) => n * 2;
    const g = (n: number) => n + 1;

    it("composition on success response", () => {
      const resp = apiSuccess(10);
      const composed = fmapApiResponse(resp, (x) => g(f(x)));
      const sequential = fmapApiResponse(fmapApiResponse(resp, f), g);
      expect(composed.success).toBe(sequential.success);
      if (composed.success && sequential.success) {
        expect(composed.data).toBe(sequential.data); // 10*2+1 = 21
      }
    });

    it("composition on error response is trivially satisfied", () => {
      const resp = apiError("timeout");
      const composed = fmapApiResponse(resp, (x: never) => g(f(x)));
      const sequential = fmapApiResponse(fmapApiResponse(resp, f), g);
      expect(composed).toEqual(sequential);
    });
  });

  describe("structural tests — wrapping preserves identity", () => {
    it("wrapping a value in apiSuccess preserves the value", () => {
      const data = { route: "Flinders", stops: 5 };
      const response = apiSuccess(data);
      expect(response.success).toBe(true);
      if (response.success) {
        expect(response.data).toEqual(data);
      }
    });

    it("success and error responses are structurally distinguishable", () => {
      const ok = apiSuccess("result");
      const err = apiError("oops");
      expect(ok.success).toBe(true);
      expect(err.success).toBe(false);
    });

    it("timestamp is a string in both variants", () => {
      const ok = apiSuccess(1);
      const err = apiError("e");
      expect(typeof ok.timestamp).toBe("string");
      expect(typeof err.timestamp).toBe("string");
    });
  });
});
