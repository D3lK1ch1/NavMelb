export interface Coordinate {
  lat: number;
  lng: number;
}

export interface RouteSegment {
  type: "car" | "train";
  coordinates: number[][];
  color: string;
  distance?: number;
  duration?: number;
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
