import path from "path";
import { loadGtfsStops } from "../../services/gtfs-stop-indexservice";

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures", "gtfs");

/**
 * Load only GTFS stops from fixtures (no timetables).
 * Use when tests only need station search / stop data.
 */
export function seedStops(): void {
  process.env.GTFS_ROOT = FIXTURES_DIR;
  loadGtfsStops();
}
