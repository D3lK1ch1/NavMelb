import path from "path";
import { createApp } from "../../app";
import { loadGtfsStops } from "../../services/gtfs-stop-indexservice";
import { loadGtfsTimetables } from "../../services/gtfs-timetable.service";
import type { Express } from "express";

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures", "gtfs");

/**
 * Creates an Express app backed by the tiny GTFS fixture data.
 * Sets GTFS_ROOT so both stop-index and timetable services read from fixtures.
 */
export async function createTestApp(): Promise<Express> {
  process.env.GTFS_ROOT = FIXTURES_DIR;
  loadGtfsStops();
  await loadGtfsTimetables();
  return createApp();
}
