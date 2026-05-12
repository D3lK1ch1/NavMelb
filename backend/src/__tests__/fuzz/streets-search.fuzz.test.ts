/**
 * Fuzz tests — GET /api/map/streets/search
 *
 * Invariant: no input produces a 500 response.
 * Streets search is pure in-memory lookup (no external calls), so this fuzz
 * focuses on: long strings, regex metacharacters, non-UTF-8 sequences,
 * and pathological limit values that could cause slice() misbehavior.
 */

import { describe, beforeAll, afterEach, expect, vi } from "vitest";
import { test as fcTest, fc } from "@fast-check/vitest";
import request from "supertest";
import type { Express } from "express";
import { createTestApp } from "../helpers/create-app";
import { withCaptureSink } from "./sinks/capture-sink";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const arbNastyString = fc.oneof(
  fc.string(),
  fc.constant(""),
  fc.constant("null"),
  fc.constant("undefined"),
  fc.constant("-1"),
  fc.constant("0"),
  fc.constant("99999999999999999"),
  fc.constant("'; DROP TABLE users; --"),
  fc.constant("<script>alert(1)</script>"),
  fc.constant("../../../etc/passwd"),
  fc.constant("%00"),
  fc.constant("a".repeat(10000)),
  // Regex metacharacters that could crash naive regex-based matching
  fc.constant(".*"),
  fc.constant("[a-z]+"),
  fc.constant("(test|foo)"),
  fc.constant("\\d{3}"),
  fc.constant("^$"),
  fc.constant("?"),
  fc.constant("*"),
  fc.constant("+"),
  fc.constant("{999,}"),
);

const arbLimit = fc.oneof(
  fc.integer({ min: -100, max: 100000 }).map(String),
  fc.constant(""),
  fc.constant("NaN"),
  fc.constant("Infinity"),
  fc.constant("-Infinity"),
  fc.constant("banana"),
  fc.constant("0"),
  fc.constant("-1"),
);

// ---------------------------------------------------------------------------

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fuzz: GET /api/map/streets/search", () => {
  fcTest.prop([arbNastyString], { numRuns: 100 })(
    "never returns 500 for any query value",
    async (query) => {
      const { teardown } = withCaptureSink("streets-search");
      try {
        const res = await request(app)
          .get("/api/map/streets/search")
          .query({ query });

        expect(res.status).not.toBe(500);
        expect(res.body).toHaveProperty("success");
      } finally {
        teardown();
      }
    },
  );

  fcTest.prop([fc.string({ minLength: 1 }), arbLimit], { numRuns: 75 })(
    "non-empty query with any limit never returns 500",
    async (query, limit) => {
      const { teardown } = withCaptureSink("streets-search-limit");
      try {
        const res = await request(app)
          .get("/api/map/streets/search")
          .query({ query, limit });

        expect(res.status).not.toBe(500);
        if (res.status === 200) {
          expect(Array.isArray(res.body.data)).toBe(true);
        }
      } finally {
        teardown();
      }
    },
  );
});
