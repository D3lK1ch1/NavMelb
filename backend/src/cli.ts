#!/usr/bin/env node
/**
 * NavMelb CLI Smoke Test
 * Hits all 6 backend endpoints with realistic Melbourne data and reports pass/fail.
 *
 * Usage:
 *   npx ts-node src/cli.ts [--url http://localhost:3000] [--verbose]
 */

import * as fs from "fs";
import * as path from "path";

// ── ANSI colours ────────────────────────────────────────────────────────────
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";
const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";

// ── Arg parsing ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let BASE_URL = "http://localhost:3000";
let VERBOSE  = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--url" && args[i + 1]) {
    BASE_URL = args[++i];
  } else if (args[i].startsWith("--url=")) {
    BASE_URL = args[i].slice("--url=".length);
  } else if (args[i] === "--verbose" || args[i] === "-v") {
    VERBOSE = true;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────
interface TestResult {
  name: string;
  method: string;
  path: string;
  passed: boolean;
  status?: number;
  durationMs: number;
  summary?: string;
  error?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function request(
  method: "GET" | "POST",
  urlPath: string,
  body?: unknown,
): Promise<{ status: number; data: unknown; durationMs: number }> {
  const url = `${BASE_URL}${urlPath}`;
  const start = Date.now();

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const durationMs = Date.now() - start;
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { status: res.status, data, durationMs };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkSuccess(data: unknown): boolean {
  return isObject(data) && data["success"] === true;
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function pad(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

// ── Individual test cases ─────────────────────────────────────────────────────
async function testHealth(): Promise<TestResult> {
  const name = "GET  /health";
  const method = "GET";
  const urlPath = "/health";
  try {
    const { status, data, durationMs } = await request("GET", urlPath);
    const ok = status === 200 && isObject(data) && data["status"] === "ok";
    return {
      name,
      method,
      path: urlPath,
      passed: ok,
      status,
      durationMs,
      summary: ok ? `status: "ok"` : `unexpected response`,
      error: ok ? undefined : `Expected {status: "ok"}, got: ${JSON.stringify(data)}`,
    };
  } catch (err: unknown) {
    return { name, method, path: urlPath, passed: false, durationMs: 0, error: String(err) };
  }
}

async function testDestinationLookup(): Promise<TestResult> {
  const name = "GET  /api/map/destination/lookup";
  const method = "GET";
  const urlPath = "/api/map/destination/lookup?query=Federation+Square";
  try {
    const { status, data, durationMs } = await request("GET", urlPath);
    const d = isObject(data) ? (data["data"] as Record<string, unknown> | undefined) : undefined;
    const ok =
      status === 200 &&
      checkSuccess(data) &&
      isObject(d) &&
      typeof d["lat"] === "number" &&
      typeof d["lng"] === "number";
    return {
      name,
      method,
      path: urlPath,
      passed: ok,
      status,
      durationMs,
      summary: ok ? `Federation Square found (${(d as Record<string, unknown>)["lat"]}, ${(d as Record<string, unknown>)["lng"]})` : "lookup failed",
      error: ok ? undefined : `Response: ${JSON.stringify(data)}`,
    };
  } catch (err: unknown) {
    return { name, method, path: urlPath, passed: false, durationMs: 0, error: String(err) };
  }
}

async function testDistance(): Promise<TestResult> {
  const name = "POST /api/map/distance";
  const method = "POST";
  const urlPath = "/api/map/distance";
  const body = {
    from: { lat: -37.8136, lng: 144.9631 },
    to:   { lat: -37.8676, lng: 144.9811 },
  };
  try {
    const { status, data, durationMs } = await request("POST", urlPath, body);
    const d = isObject(data) ? (data["data"] as Record<string, unknown> | undefined) : undefined;
    const distance = isObject(d) ? (d["distance"] as number | undefined) : undefined;
    const ok =
      status === 200 &&
      checkSuccess(data) &&
      isObject(d) &&
      typeof distance === "number" &&
      distance > 0;
    const km = isObject(d) ? d["distanceKm"] : undefined;
    return {
      name,
      method,
      path: urlPath,
      passed: ok,
      status,
      durationMs,
      summary: ok ? `${km}km (CBD → St Kilda)` : "distance calculation failed",
      error: ok ? undefined : `Response: ${JSON.stringify(data)}`,
    };
  } catch (err: unknown) {
    return { name, method, path: urlPath, passed: false, durationMs: 0, error: String(err) };
  }
}

async function testStationsSearch(): Promise<TestResult> {
  const name = "GET  /api/map/stations/search";
  const method = "GET";
  const urlPath = "/api/map/stations/search?query=flinders";
  try {
    const { status, data, durationMs } = await request("GET", urlPath);
    const d = isObject(data) ? data["data"] : undefined;
    const arr = Array.isArray(d) ? d : null;
    const ok =
      status === 200 &&
      checkSuccess(data) &&
      arr !== null &&
      arr.length > 0;
    return {
      name,
      method,
      path: urlPath,
      passed: ok,
      status,
      durationMs,
      summary: ok ? `${arr!.length} stations found` : "no stations returned",
      error: ok ? undefined : `Response: ${JSON.stringify(data)}`,
    };
  } catch (err: unknown) {
    return { name, method, path: urlPath, passed: false, durationMs: 0, error: String(err) };
  }
}

async function testRouteCalculate(): Promise<TestResult> {
  const name = "POST /api/map/route/calculate";
  const method = "POST";
  const urlPath = "/api/map/route/calculate";
  // Car strategy: Melbourne CBD → Fitzroy
  const body = {
    origin:      { lat: -37.8136, lng: 144.9631 },
    destination: { lat: -37.8235, lng: 144.9898 },
    strategy:    "car",
  };
  try {
    const { status, data, durationMs } = await request("POST", urlPath, body);
    // Accept 200 or 207 (partial failures with ptv)
    const statusOk = status === 200 || status === 207;
    const d = isObject(data) ? (data["data"] as Record<string, unknown> | undefined) : undefined;
    const segments = isObject(d) ? d["segments"] : undefined;
    const ok =
      statusOk &&
      checkSuccess(data) &&
      Array.isArray(segments);
    const km = isObject(d) && typeof d["totalDistance"] === "number"
      ? `${((d["totalDistance"] as number) / 1000).toFixed(1)}km`
      : "?";
    return {
      name,
      method,
      path: urlPath,
      passed: ok,
      status,
      durationMs,
      summary: ok
        ? `${(segments as unknown[]).length} segment(s), ${km}`
        : "route calculation failed",
      error: ok ? undefined : `Response: ${JSON.stringify(data)}`,
    };
  } catch (err: unknown) {
    return { name, method, path: urlPath, passed: false, durationMs: 0, error: String(err) };
  }
}

async function testStreetsSearch(): Promise<TestResult> {
  const name = "GET  /api/map/streets/search";
  const method = "GET";
  const urlPath = "/api/map/streets/search?query=Flinders";
  try {
    const { status, data, durationMs } = await request("GET", urlPath);
    const d = isObject(data) ? data["data"] : undefined;
    const arr = Array.isArray(d) ? d : null;
    const ok =
      status === 200 &&
      checkSuccess(data) &&
      arr !== null;
    return {
      name,
      method,
      path: urlPath,
      passed: ok,
      status,
      durationMs,
      summary: ok ? `${arr!.length} streets found` : "streets search failed",
      error: ok ? undefined : `Response: ${JSON.stringify(data)}`,
    };
  } catch (err: unknown) {
    return { name, method, path: urlPath, passed: false, durationMs: 0, error: String(err) };
  }
}

async function testStreetsNearby(): Promise<TestResult> {
  const name = "GET  /api/map/streets/nearby";
  const method = "GET";
  const urlPath = "/api/map/streets/nearby?lat=-37.8183&lng=144.9671&radius=500";
  try {
    const { status, data, durationMs } = await request("GET", urlPath);
    const d = isObject(data) ? data["data"] : undefined;
    const arr = Array.isArray(d) ? d : null;
    const ok =
      status === 200 &&
      checkSuccess(data) &&
      arr !== null;
    return {
      name,
      method,
      path: urlPath,
      passed: ok,
      status,
      durationMs,
      summary: ok ? `${arr!.length} nearby streets` : "nearby streets failed",
      error: ok ? undefined : `Response: ${JSON.stringify(data)}`,
    };
  } catch (err: unknown) {
    return { name, method, path: urlPath, passed: false, durationMs: 0, error: String(err) };
  }
}

// ── Error log check ───────────────────────────────────────────────────────────
function checkErrorLog(logPath: string, beforeSize: number): string {
  if (!fs.existsSync(logPath)) return "";
  try {
    const afterSize = fs.statSync(logPath).size;
    const newBytes = afterSize - beforeSize;
    if (newBytes <= 0) {
      return `  ${DIM}Event log: 0 new errors (logs/errors.log)${RESET}\n`;
    }
    // Read the new portion
    const fd = fs.openSync(logPath, "r");
    const buf = Buffer.alloc(newBytes);
    fs.readSync(fd, buf, 0, newBytes, beforeSize);
    fs.closeSync(fd);
    const newLines = buf
      .toString("utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0);
    let out = `  ${YELLOW}Event log: ${newLines.length} new error(s) (logs/errors.log)${RESET}\n`;
    if (VERBOSE) {
      for (const line of newLines) {
        out += `    ${DIM}${line}${RESET}\n`;
      }
    }
    return out;
  } catch {
    return `  ${DIM}Event log: could not read logs/errors.log${RESET}\n`;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Snapshot error log size before tests
  const logPath = path.resolve(process.cwd(), "logs/errors.log");
  let beforeLogSize = 0;
  if (fs.existsSync(logPath)) {
    try {
      beforeLogSize = fs.statSync(logPath).size;
    } catch { /* ignore */ }
  }

  console.log(`\n${BOLD}NavMelb Smoke Test${RESET}`);
  console.log(`${"=".repeat(18)}`);
  console.log(`${DIM}Target: ${BASE_URL}${RESET}\n`);

  const tests: Array<() => Promise<TestResult>> = [
    testHealth,
    testDestinationLookup,
    testDistance,
    testStationsSearch,
    testRouteCalculate,
    testStreetsSearch,
    testStreetsNearby,
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    const r = await test();
    results.push(r);

    const icon       = r.passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const statusStr  = r.status != null ? `${r.status}` : "ERR";
    const statusCol  = r.status != null && r.status < 300 ? GREEN : RED;
    const dur        = formatDuration(r.durationMs);
    const summaryStr = r.summary ? `${DIM}→ ${r.summary}${RESET}` : "";

    const line = [
      ` ${icon}`,
      pad(r.name, 38),
      `${statusCol}${pad(statusStr, 4)}${RESET}`,
      pad(dur, 8),
      summaryStr,
    ].join(" ");

    console.log(line);

    if (VERBOSE && r.error) {
      console.log(`    ${RED}${r.error}${RESET}`);
    }
  }

  console.log();

  // Error log report
  const logReport = checkErrorLog(logPath, beforeLogSize);
  if (logReport) process.stdout.write(logReport);

  const passed = results.filter((r) => r.passed).length;
  const total  = results.length;
  const allOk  = passed === total;

  if (allOk) {
    console.log(`  ${GREEN}${BOLD}${passed}/${total} passed${RESET}\n`);
  } else {
    const failed = results.filter((r) => !r.passed);
    console.log(`  ${RED}${BOLD}${passed}/${total} passed — ${failed.length} failed:${RESET}`);
    for (const r of failed) {
      console.log(`    ${RED}✗ ${r.name}${RESET}`);
      if (r.error) console.log(`      ${DIM}${r.error}${RESET}`);
    }
    console.log();
  }

  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(`${RED}Fatal error: ${err}${RESET}`);
  process.exit(1);
});
