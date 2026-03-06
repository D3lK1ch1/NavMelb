export interface Coordinate {
  lat: number;
  lng: number;
}

export type RouteStrategy = "car" | "pt" | "park-and-ride";

export interface Waypoint {
  position: Coordinate;
  type: "station" | "place";
  name?: string;
  transportType?: "tram" | "train" | "bus";
}

export interface RoutePlan {
  origin: Coordinate;
  destination: Coordinate;
  waypoints: Waypoint[];
  strategy: RouteStrategy;
}

export interface RouteSegment {
  type: "car" | "pt";
  coordinates: number[][];
  color: string;
  distance?: number;
  duration?: number;
}

export interface RouteResult {
  segments: RouteSegment[];
  totalDistance: number;
  totalDuration: number;
  estimatedArrival?: string;
  departureInfo?: DepartureInfo[];
}

export interface DepartureInfo {
  stationName: string;
  nextDeparture: string;
  waitTimeMinutes: number;
}

export interface RouteOption {
  id: string;
  type: "car" | "ptv";
  startPoint: Coordinate;
  endPoint: Coordinate;
  distance: number;
  duration: number;
  waypoints?: Coordinate[];
  cost?: number;
  segments?: RouteSegment[];
}

export interface Station {
  id: string;
  name: string;
  position: Coordinate;
  transportType: "tram" | "train" | "bus";
  hasParking: boolean;
  parkingCapacity?: number;
  parkingAvailable?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}
