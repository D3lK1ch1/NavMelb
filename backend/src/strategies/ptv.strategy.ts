import { Coordinate, RouteSegment, FailedLeg } from "../types";
import { calculateDistance, getPTVRoute, osrmRoute } from "../services/route-map.service";
import { IRouteStrategy, RouteCommand, RouteStrategyResult } from "./types";

const log = process.env.NODE_ENV !== "production" ? console.log : () => {};

function advanceTime(currentTime: string, durationSeconds: number): string {
  const parts = currentTime.split(":").map(Number);
  const baseSec = parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
  const nextSec = baseSec + Math.round(durationSeconds);
  const nh = Math.floor(nextSec / 3600) % 24;
  const nm = Math.floor((nextSec % 3600) / 60);
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}:00`;
}

export class PtvStrategy implements IRouteStrategy {
  async execute(cmd: RouteCommand): Promise<RouteStrategyResult> {
    const { origin, destination, waypoints, departureTime } = cmd;

    const stationStops = waypoints.filter((w) => w.type === "station");
    if (stationStops.length < 1) {
      throw new PtvValidationError(
        "PTV routing requires at least one station stop. Add stations to your journey chain."
      );
    }

    // Build full point list: origin + all waypoints + destination
    const allPoints: Array<{ position: Coordinate; type: "station" | "place"; name: string }> = [
      { position: origin, type: "place", name: "Origin" },
      ...waypoints.map((w) => ({ position: w.position, type: w.type, name: w.name || "" })),
      { position: destination, type: "place", name: "Destination" },
    ];

    log(`[PtvStrategy] waypoints: ${stationStops.length} station(s)`);
    log(`[PtvStrategy] All points:`, allPoints.map((p) => `${p.type}:${p.name}`).join(" -> "));

    const segments: (RouteSegment | FailedLeg)[] = [];
    let totalDistance = 0;
    let totalDuration = 0;
    let currentTime = departureTime;

    for (let i = 0; i < allPoints.length - 1; i++) {
      const from = allPoints[i];
      const to = allPoints[i + 1];

      if (from.type === "station" && to.type === "station") {
        log(`[PtvStrategy] Leg ${i + 1}: PTV "${from.name}" -> "${to.name}"`);
        const ptv = await getPTVRoute(from.position, to.position, from.name, to.name);
        if (!ptv) {
          log(`[PtvStrategy] Leg ${i + 1}: FAILED`);
          segments.push({ type: "failed", from: from.name, to: to.name });
          continue;
        }

        log(`[PtvStrategy] Leg ${i + 1}: SUCCESS ${Math.round(ptv.duration / 60)}min, ${ptv.geometry.length} points`);
        const dist = calculateDistance(from.position, to.position);
        segments.push({
          type: "ptv",
          coordinates: ptv.geometry,
          color: "#F44336",
          distance: dist,
          duration: ptv.duration,
        });
        totalDistance += dist;
        totalDuration += ptv.duration;
        currentTime = advanceTime(currentTime, ptv.duration);
      } else {
        log(`[PtvStrategy] Leg ${i + 1}: Car "${from.name}" -> "${to.name}"`);
        const car = await osrmRoute(from.position, to.position);
        log(`[PtvStrategy] Leg ${i + 1}: Car ${Math.round(car.distance)}m, ${Math.round(car.duration)}s`);
        segments.push({
          type: "car",
          coordinates: car.geometry,
          color: "#2196F3",
          distance: car.distance,
          duration: car.duration,
        });
        totalDistance += car.distance;
        totalDuration += car.duration;
      }
    }

    log(`[PtvStrategy] Result: ${segments.length} legs, ${Math.round(totalDistance / 1000)}km, ${Math.round(totalDuration / 60)}min`);

    return { segments, totalDistance, totalDuration };
  }
}

export class PtvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PtvValidationError";
  }
}
