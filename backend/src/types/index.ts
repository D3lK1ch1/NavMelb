export interface Coordinate {
  lat: number;
  lng: number;
}

export interface RouteOption {
  id: string;
  type: "car" | "ptv" | "combined";
  startPoint: Coordinate;
  endPoint: Coordinate;
  distance: number; // in meters
  duration: number; // in seconds
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

export interface ParkingLot {
  id: string;
  name: string;
  position: Coordinate;
  capacity: number;
  available: number;
  costPerHour?: number;
  nearbyStation?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}
