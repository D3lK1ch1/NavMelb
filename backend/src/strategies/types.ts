import { Coordinate, RouteSegment, FailedLeg, Waypoint } from "../types";

export interface RouteCommand {
  origin: Coordinate;
  originName?: string;
  originType?: "station" | "place";
  destination: Coordinate;
  destinationName?: string;
  destinationType?: "station" | "place";
  waypoints: Waypoint[];
  departureTime: string;
}

export interface RouteStrategyResult {
  segments: (RouteSegment | FailedLeg)[];
  totalDistance: number;
  totalDuration: number;
}

export interface IRouteStrategy {
  execute(cmd: RouteCommand): Promise<RouteStrategyResult>;
}
