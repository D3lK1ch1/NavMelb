export interface Coordinate {
  lat: number;
  lng: number;
}

export interface TrafficLight {
  id: string;
  position: Coordinate;
  state: "red" | "amber" | "green";
  road: string;
  direction: string;
}

export interface RouteOption {
  id: string;
  type: "car" | "ptv" | "combined";
  startPoint: Coordinate;
  endPoint: Coordinate;
  distance: number;
  duration: number;
  waypoints?: Coordinate[];
  cost?: number;
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
