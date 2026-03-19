import path from "path";
import { createApp } from "../../app";
import { loadGtfsStops } from "../../services/gtfs-stop-indexservice";
import { loadGtfsTimetables } from "../../services/gtfs-timetable.service";
import { loadStreetData } from "../../services/street-data.service";
import type { Express } from "express";

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");

/**
 * Creates an Express app backed by the tiny GTFS fixture data and street fixture.
 * Sets GTFS_ROOT so both stop-index and timetable services read from fixtures.
 */
export async function createTestApp(): Promise<Express> {
  process.env.GTFS_ROOT = path.join(FIXTURES_DIR, "gtfs");
  loadGtfsStops();
  await loadGtfsTimetables();
  loadStreetData(path.join(FIXTURES_DIR, "street-names.geojson"));
  return createApp();
}
