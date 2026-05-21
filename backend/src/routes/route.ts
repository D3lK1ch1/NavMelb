import { Router, Request, Response } from "express";
import { ApiResponse, Coordinate, RouteResult, RouteStrategy, Waypoint, DepartureInfo, TransportType } from "../types";
import { calculateDistance, lookupDestinationAny } from "../services/route-map.service";
import { ptvSearchStops, ptvGetDepartures, ptvFindStopByName } from "../services/ptv-api.service";
import { searchStreets, nearbyStreets } from "../services/street-data.service";
import { IRouteStrategy, RouteCommand } from "../strategies/types";
import { CarStrategy } from "../strategies/car.strategy";
import { PtvStrategy, PtvValidationError } from "../strategies/ptv.strategy";
import { dispatch } from "../events/dispatch";
import { classifyInfraError } from "../events/infra";

const router = Router();

const strategies: Record<RouteStrategy, IRouteStrategy> = {
  car: new CarStrategy(),
  ptv: new PtvStrategy(),
};

async function fetchDepartureInfo(waypoints: Waypoint[]): Promise<DepartureInfo[]> {
  const stationWaypoints = waypoints.filter((w) => w.type === "station" && w.name);
  const results = await Promise.all(
    stationWaypoints.map(async (w) => {
      const stopInfo = await ptvFindStopByName(w.name!);
      if (!stopInfo) return null;
      const deps = await ptvGetDepartures(0, stopInfo.stopId, { limit: 1 });
      if (!deps.length) return null;
      const firstDep = deps[0];
      const scheduled = new Date(firstDep.scheduledDepartureUtc);
      const now = new Date();
      const waitMs = scheduled.getTime() - now.getTime();
      const waitMinutes = Math.max(0, Math.ceil(waitMs / 60000));
      return {
        stationName: w.name!,
        nextDeparture: firstDep.scheduledDepartureUtc,
        waitTimeMinutes: waitMinutes,
      };
    })
  );
  return results.filter((d): d is DepartureInfo => d !== null);
}

router.get("/destination/lookup", async (req: Request, res: Response) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: "Missing query parameter",
      timestamp: new Date().toISOString(),
    });
  }

  try {
    if ((query as string).length > 200) {
      return res.status(400).json({
        success: false,
        error: "Query too long (max 200 characters)",
        timestamp: new Date().toISOString(),
      });
    }

    const coordinates = await lookupDestinationAny(query as string);

    if (!coordinates) {
      dispatch({ type: "destination.lookup.not_found", query: query as string });
      return res.status(404).json({
        success: false,
        error: `Place "${query}" not found`,
        timestamp: new Date().toISOString(),
      });
    }

    dispatch({ type: "destination.lookup.success", query: query as string, source: "geocode" });

    const response: ApiResponse<Coordinate> = {
      success: true,
      data: coordinates,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    const classified = classifyInfraError(error);
    dispatch({ type: "destination.lookup.error", query: query as string, error: classified });
    res.status(500).json({
      success: false,
      error: "Failed to lookup destination",
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/distance", (req: Request, res: Response) => {
  try {
    const { from, to } = req.body;

    if (!from || !to || from.lat == null || from.lng == null || to.lat == null || to.lng == null) {
      return res.status(400).json({
        success: false,
        error: "Invalid coordinates format. Expected: { from: {lat, lng}, to: {lat, lng} }",
        timestamp: new Date().toISOString(),
      });
    }

    if (isNaN(Number(from.lat)) || isNaN(Number(from.lng)) || isNaN(Number(to.lat)) || isNaN(Number(to.lng))) {
      return res.status(400).json({
        success: false,
        error: "Coordinates must be numeric",
        timestamp: new Date().toISOString(),
      });
    }

    if (Number(from.lat) < -90 || Number(from.lat) > 90 || Number(to.lat) < -90 || Number(to.lat) > 90) {
      return res.status(400).json({
        success: false,
        error: "Latitude must be between -90 and 90",
        timestamp: new Date().toISOString(),
      });
    }

    if (Number(from.lng) < -180 || Number(from.lng) > 180 || Number(to.lng) < -180 || Number(to.lng) > 180) {
      return res.status(400).json({
        success: false,
        error: "Longitude must be between -180 and 180",
        timestamp: new Date().toISOString(),
      });
    }

    const distance = calculateDistance(from, to);

    dispatch({ type: "distance.calculated", distanceMeters: distance });

    const response: ApiResponse<{ distance: number; distanceKm: number; unit: string }> = {
      success: true,
      data: {
        distance,
        distanceKm: Math.round((distance / 1000) * 100) / 100,
        unit: "meters",
      },
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to calculate distance",
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/stations/search", async (req: Request, res: Response) => {
  const { query, limit, transportType } = req.query;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: "Missing query parameter",
      timestamp: new Date().toISOString(),
    });
  }

  try {
    
    if ((query as string).length > 200) {
      return res.status(400).json({
        success: false,
        error: "Query too long (max 200 characters)",
        timestamp: new Date().toISOString(),
      });
    }

    if (limit !== undefined) {
      const limitNum = Number(limit);
      if (isNaN(limitNum) || !Number.isInteger(limitNum)) {
        return res.status(400).json({
          success: false,
          error: "Limit must be an integer",
          timestamp: new Date().toISOString(),
        });
      }
      if (limitNum < 0) {
        return res.status(400).json({
          success: false,
          error: "Limit must not be negative",
          timestamp: new Date().toISOString(),
        });
      }
      if (limitNum > 100) {
        return res.status(400).json({
          success: false,
          error: "Limit must not exceed 100",
          timestamp: new Date().toISOString(),
        });
      }
    }
    
    const ptvStops = await ptvSearchStops(query as string);

    const filtered = ptvStops.filter((s) => {
      if (transportType) {
        if (transportType === "train") {
          return s.routeType.includes(0);
        } else if (transportType === "tram") {
          return s.routeType.includes(1);
        } else if (transportType === "bus") {
          return s.routeType.includes(2);
        }
      }
      return true;
    });

    const pageLimit = Number(limit) || 50;
    const results = filtered
      .slice(0, pageLimit)
      .map((s) => ({
        name: s.displayName,
        position: s.position,
        transportTypes: s.routeType?.length ? s.routeType.map((t) => (["train", "tram", "bus"][t]) as TransportType) : (["train"] as TransportType[]),
      }));

    dispatch({ type: "stations.search.success", query: query as string, count: results.length });

    res.json({
      success: true,
      data: results,
      total: filtered.length,
      truncated: filtered.length > pageLimit,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const classified = classifyInfraError(error);
    dispatch({ type: "stations.search.error", query: query as string, error: classified });
    res.status(500).json({
      success: false,
      error: "Failed to search stations",
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/route/calculate", async (req: Request, res: Response) => {
  try {
    const { origin, destination, waypoints, strategy, departureTime } = req.body as {
      origin: Coordinate;
      destination: Coordinate;
      waypoints?: Waypoint[];
      strategy: RouteStrategy;
      departureTime?: string;
    };

    if (!origin || !destination || origin.lat == null || origin.lng == null || destination.lat == null || destination.lng == null) {
      return res.status(400).json({
        success: false,
        error: "Invalid coordinates. Expected: { origin: {lat, lng}, destination: {lat, lng} }",
        timestamp: new Date().toISOString(),
      });
    }

    if (isNaN(Number(origin.lat)) || isNaN(Number(origin.lng)) || isNaN(Number(destination.lat)) || isNaN(Number(destination.lng))) {
      return res.status(400).json({
        success: false,
        error: "Coordinates must be numeric",
        timestamp: new Date().toISOString(),
      });
    }

    if (Number(origin.lat) < -90 || Number(origin.lat) > 90 || Number(destination.lat) < -90 || Number(destination.lat) > 90) {
      return res.status(400).json({
        success: false,
        error: "Latitude must be between -90 and 90",
        timestamp: new Date().toISOString(),
      });
    }

    if (Number(origin.lng) < -180 || Number(origin.lng) > 180 || Number(destination.lng) < -180 || Number(destination.lng) > 180) {
      return res.status(400).json({
        success: false,
        error: "Longitude must be between -180 and 180",
        timestamp: new Date().toISOString(),
      });
    }

    if (waypoints && waypoints.length > 20) {
      return res.status(400).json({
        success: false,
        error: "Too many waypoints (max 20)",
        timestamp: new Date().toISOString(),
      });
    }

    if (!strategy || !["car", "ptv"].includes(strategy)) {
      return res.status(400).json({
        success: false,
        error: "Invalid strategy. Must be: 'car' or 'ptv'",
        timestamp: new Date().toISOString(),
      });
    }

    if (departureTime !== undefined && !/^\d{2}:\d{2}(:\d{2})?$/.test(departureTime)) {
      return res.status(400).json({
        success: false,
        error: "Invalid departureTime format. Expected HH:MM or HH:MM:SS",
        timestamp: new Date().toISOString(),
      });
    }
    const invalidWaypointEarly = (waypoints || []).find(
      (w) => !w || !w.position || w.position.lat == null || w.position.lng == null
    );
    if (invalidWaypointEarly) {
      return res.status(400).json({
        success: false,
        error: "Invalid waypoint: each waypoint must have a position with lat and lng",
        timestamp: new Date().toISOString(),
      });
    }

    if (departureTime !== undefined) {
      const parts = departureTime.split(":").map(Number);
      if (parts[0] < 0 || parts[0] > 23 || parts[1] < 0 || parts[1] > 59 || (parts[2] !== undefined && (parts[2] < 0 || parts[2] > 59))) {
        return res.status(400).json({
          success: false,
          error: "Invalid departureTime: hours must be 0-23, minutes and seconds must be 0-59",
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Normalise departure time: accept "HH:MM" or "HH:MM:SS", default to now
    const now = new Date();
    const resolvedDeparture = departureTime
      ? (departureTime.split(":").length === 2 ? departureTime + ":00" : departureTime)
      : `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`;

    // Build command and execute strategy
    const cmd: RouteCommand = {
      origin,
      destination,
      waypoints: waypoints || [],
      departureTime: resolvedDeparture,
    };

    const { segments, totalDistance, totalDuration } = await strategies[strategy].execute(cmd);
    dispatch({ type: "route.calculated", strategy, legs: segments.length, totalDistanceMeters: totalDistance, totalDurationSeconds: totalDuration });

    const departureInfo = strategy !== "car"
      ? await fetchDepartureInfo(waypoints || [])
      : undefined;

    const arrivalTime = new Date(Date.now() + totalDuration * 1000);

    const failedLegsCount = segments.filter((s) => s.type === "failed").length;

    const result: RouteResult = {
      segments,
      totalDistance,
      totalDuration,
      estimatedArrival: arrivalTime.toISOString(),
      departureInfo: departureInfo?.length ? departureInfo : undefined,
      failedLegs: failedLegsCount,
    };

    const response: ApiResponse<RouteResult> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
    const hasFailures = failedLegsCount > 0;
    res.status(hasFailures ? 207 : 200).json(response);
  } catch (error) {
    if (error instanceof PtvValidationError) {
      return res.status(400).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
    const classified = classifyInfraError(error);
    dispatch({ type: "route.error", strategy: String(req.body?.strategy ?? "unknown"), error: classified });
    res.status(500).json({
      success: false,
      error: "Failed to calculate route",
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/streets/search", (req: Request, res: Response) => {
  try {
    const { query, limit } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Missing query parameter",
        timestamp: new Date().toISOString(),
      });
    }

    if ((query as string).length > 200) {
      return res.status(400).json({
        success: false,
        error: "Query too long (max 200 characters)",
        timestamp: new Date().toISOString(),
      });
    }

    if (limit !== undefined) {
      const limitNum = Number(limit);
      if (isNaN(limitNum) || !Number.isInteger(limitNum)) {
        return res.status(400).json({
          success: false,
          error: "Limit must be an integer",
          timestamp: new Date().toISOString(),
        });
      }
      if (limitNum < 0) {
        return res.status(400).json({
          success: false,
          error: "Limit must not be negative",
          timestamp: new Date().toISOString(),
        });
      }
      if (limitNum > 100) {
        return res.status(400).json({
          success: false,
          error: "Limit must not exceed 100",
          timestamp: new Date().toISOString(),
        });
      }
    }

    const streetLimit = Number(limit) || 20;
    const allStreets = searchStreets(query as string, Infinity);
    const results = allStreets.slice(0, streetLimit);


    dispatch({ type: "streets.search.success", query: query as string, count: results.length });

    res.json({
      success: true,
      data: results,
      total: allStreets.length,
      truncated: allStreets.length > streetLimit,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to search streets",
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/streets/nearby", (req: Request, res: Response) => {
  try {
    const { lat, lng, radius, limit } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: "Missing lat and lng parameters",
        timestamp: new Date().toISOString(),
      });
    }

    if (isNaN(Number(lat)) || isNaN(Number(lng))) {
      return res.status(400).json({
        success: false,
        error: "lat and lng must be numeric",
        timestamp: new Date().toISOString(),
      });
    }

    if (radius !== undefined && isNaN(Number(radius))) {
      return res.status(400).json({
        success: false,
        error: "radius must be numeric",
        timestamp: new Date().toISOString(),
      });
    }

    if (Number(lat) < -90 || Number(lat) > 90) {
      return res.status(400).json({
        success: false,
        error: "Latitude must be between -90 and 90",
        timestamp: new Date().toISOString(),
      });
    }

    if (Number(lng) < -180 || Number(lng) > 180) {
      return res.status(400).json({
        success: false,
        error: "Longitude must be between -180 and 180",
        timestamp: new Date().toISOString(),
      });
    }

    if (limit !== undefined) {
      const limitNum = Number(limit);
      if (isNaN(limitNum) || !Number.isInteger(limitNum)) {
        return res.status(400).json({
          success: false,
          error: "Limit must be an integer",
          timestamp: new Date().toISOString(),
        });
      }
      if (limitNum < 0) {
        return res.status(400).json({
          success: false,
          error: "Limit must not be negative",
          timestamp: new Date().toISOString(),
        });
      }
      if (limitNum > 100) {
        return res.status(400).json({
          success: false,
          error: "Limit must not exceed 100",
          timestamp: new Date().toISOString(),
        });
      }
    }

    const nearbyLimit = Number(limit) || 20;
    const allNearby = nearbyStreets(
      { lat: Number(lat), lng: Number(lng) },
      Number(radius) || 200,
      Infinity,
    );
    const results = allNearby.slice(0, nearbyLimit);

    dispatch({ type: "streets.nearby.success", lat: Number(lat), lng: Number(lng), count: results.length });

    res.json({
      success: true,
      data: results,
      total: allNearby.length,
      truncated: allNearby.length > nearbyLimit,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to find nearby streets",
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
