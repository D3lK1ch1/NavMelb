// NavMelb event types — observational events emitted by business logic.
// All events are past-tense and factual (things that happened, not commands).

export type NavEvent =
  // Destination lookup
  | { type: "destination.lookup.success"; query: string; source: "gtfs" | "geocode" }
  | { type: "destination.lookup.not_found"; query: string }
  | { type: "destination.lookup.error"; query: string; error: unknown }

  // Station search
  | { type: "stations.search.success"; query: string; count: number }
  | { type: "stations.search.error"; query: string; error: unknown }

  // Distance calculation
  | { type: "distance.calculated"; distanceMeters: number }

  // Route calculation
  | { type: "route.calculated"; strategy: string; legs: number; totalDistanceMeters: number; totalDurationSeconds: number }
  | { type: "route.partial_failure"; strategy: string; failedLegs: number; totalLegs: number }
  | { type: "route.error"; strategy: string; error: unknown }

  // Individual leg events
  | { type: "route.leg.ptv.success"; from: string; to: string; durationSeconds: number }
  | { type: "route.leg.ptv.failed"; from: string; to: string }
  | { type: "route.leg.car.success"; from: string; to: string; distanceMeters: number; durationSeconds: number }

  // Street search
  | { type: "streets.search.success"; query: string; count: number }
  | { type: "streets.nearby.success"; lat: number; lng: number; count: number }

  // External API calls
  | { type: "external.api.called"; service: "ptv" | "osrm" | "nominatim"; endpoint: string }
  | { type: "external.api.failed"; service: "ptv" | "osrm" | "nominatim"; endpoint: string; error: unknown }

  // Infrastructure / configuration warnings
  | { type: "infra.missing_data"; resource: string; message: string }
  | { type: "infra.credentials_missing"; service: string }

  // PTV route resolution steps (replaces dense console.log tracing in ptv-api.service)
  | { type: "ptv.route.origin_found"; stopId: number; displayName: string }
  | { type: "ptv.route.origin_not_found"; query: string; routeType: number }
  | { type: "ptv.route.destination_found"; stopId: number; displayName: string }
  | { type: "ptv.route.destination_not_found"; query: string; routeType: number }
  | { type: "ptv.route.no_departures"; stopId: number }
  | { type: "ptv.route.success"; from: string; to: string; stops: number; durationSeconds: number }
  | { type: "ptv.route.no_matching_pattern"; from: string; to: string };
