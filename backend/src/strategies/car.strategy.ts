import { RouteSegment } from "../types";
import { osrmRoute } from "../services/route-map.service";
import { IRouteStrategy, RouteCommand, RouteStrategyResult } from "./types";

export class CarStrategy implements IRouteStrategy {
  async execute(cmd: RouteCommand): Promise<RouteStrategyResult> {
    const { origin, destination, waypoints } = cmd;
    const carRoute = await osrmRoute(origin, destination, waypoints.map((w) => w.position));
    const segment: RouteSegment = {
      type: "car",
      coordinates: carRoute.geometry,
      color: "#2196F3",
      distance: carRoute.distance,
      duration: carRoute.duration,
    };
    return {
      segments: [segment],
      totalDistance: carRoute.distance,
      totalDuration: carRoute.duration,
    };
  }
}
