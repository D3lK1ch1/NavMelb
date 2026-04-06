export interface Coordinate {
  lat: number;
  lng: number;
}

export type RouteStrategy = "car" | "ptv" ;

export type TransportType = "tram" | "train" | "bus";

export interface Waypoint {
  position: Coordinate;
  type: "station" | "place";
  name?: string;
  transportTypes?: TransportType[];
}

export interface RoutePlan {
  origin: Coordinate;
  destination: Coordinate;
  waypoints: Waypoint[];
  strategy: RouteStrategy;
}

export interface RouteSegment {
  type: "car" | "ptv" | "failed";
  coordinates: number[][];
  color: string;
  distance?: number;
  duration?: number;
}

export interface FailedLeg {
  type: "failed";
  from: string;
  to: string;
}

export interface RouteResult {
  segments: (RouteSegment | FailedLeg)[];
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
  transportType: TransportType;
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

export interface ShapePoint {
  lat: number;
  lng: number;
  sequence: number;
  distance?: number;
}

export interface ShapeSegmentResult {
  coordinates: [number, number][];
  durationMinutes: number;
}
