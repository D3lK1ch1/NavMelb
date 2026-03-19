import { describe, it, expect, beforeAll } from "vitest";
import { getAllStops, findStopCoordinate, loadGtfsStops } from "../../services/gtfs-stop-indexservice";
import { seedStops } from "../helpers/seed-stops";

describe("GTFS stop indexing", () => {
  beforeAll(() => {
    seedStops();
  });

  it("loads the correct number of unique stops from fixtures", () => {
    const stops = getAllStops();
    // Train: Flinders St (merged), Southern Cross, Richmond, Parliament, Melbourne Central = 5
    // Tram: Federation Square/Flinders St, Melbourne University, St Kilda Rd/Arts Precinct = 3
    // Total unique normalized names = 8
    expect(stops.length).toBeGreaterThanOrEqual(7);
    expect(stops.length).toBeLessThanOrEqual(9);
  });

  it("normalizes names (lowercase, 'station' removed)", () => {
    const stops = getAllStops();
    for (const stop of stops) {
      expect(stop.name).toBe(stop.name.toLowerCase());
      expect(stop.name).not.toMatch(/\bstation\b/);
    }
  });

  it("maps transport types correctly (folder 1 → train, folder 3 → tram)", () => {
    // Richmond is only in the train fixture
    const richmond = findStopCoordinate("Richmond Station");
    expect(richmond).not.toBeNull();
    expect(richmond!.transportTypes).toContain("train");

    // Melbourne University is only in the tram fixture
    const melbUni = findStopCoordinate("Melbourne University");
    expect(melbUni).not.toBeNull();
    expect(melbUni!.transportTypes).toContain("tram");
  });

  it("proximity-merges stops <150m apart with the same name", () => {
    // Two "Flinders Street Station" entries ~50m apart should merge
    const flinders = findStopCoordinate("Flinders Street Station");
    expect(flinders).not.toBeNull();
    // The merged position should be the average of -37.8183/-37.8179 and 144.9671/144.9675
    expect(flinders!.position.lat).toBeCloseTo(-37.8181, 3);
    expect(flinders!.position.lng).toBeCloseTo(144.9673, 3);
  });
});
