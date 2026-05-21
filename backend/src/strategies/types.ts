import { Coordinate, RouteSegment, FailedLeg, Waypoint } from "../types";

export interface RouteCommand {
  origin: Coordinate;
  destination: Coordinate;
  waypoints: Waypoint[];
  departureTime: string; // normalised HH:MM:SS
}

export interface RouteStrategyResult {
  segments: (RouteSegment | FailedLeg)[];
  totalDistance: number;
  totalDuration: number;
}

export interface IRouteStrategy {
  execute(cmd: RouteCommand): Promise<RouteStrategyResult>;
}
