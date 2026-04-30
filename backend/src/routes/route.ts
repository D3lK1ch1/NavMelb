import { Router, Request, Response } from "express";
import { ApiResponse, Coordinate, RouteSegment, RouteResult, RouteStrategy, Waypoint, FailedLeg, TransportType, DepartureInfo } from "../types";
import { calculateDistance, lookupDestinationAny, osrmRoute, getPTVRoute } from "../services/route-map.service";
import { ptvSearchStops, ptvGetDepartures, ptvFindStopByName } from "../services/ptv-api.service";
import { searchStreets, nearbyStreets } from "../services/street-data.service";

const log = process.env.NODE_ENV !== "production" ? console.log : () => {};

const router = Router();

router.get("/destination/lookup", async (req: Request, res: Response) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Missing query parameter",
        timestamp: new Date().toISOString(),
      });
    }

    const coordinates = await lookupDestinationAny(query as string);

    if (!coordinates) {
      return res.status(404).json({
        success: false,
        error: `Place "${query}" not found`,
        timestamp: new Date().toISOString(),
      });
    }

    const response: ApiResponse<Coordinate> = {
      success: true,
      data: coordinates,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
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

    if (!from || !to || !from.lat || !from.lng || !to.lat || !to.lng) {
      return res.status(400).json({
        success: false,
        error: "Invalid coordinates format. Expected: { from: {lat, lng}, to: {lat, lng} }",
        timestamp: new Date().toISOString(),
      });
    }

    const distance = calculateDistance(from, to);

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
  try {
    const { query, limit, transportType } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Missing query parameter",
        timestamp: new Date().toISOString(),
      });
    }

    const ptvStops = await ptvSearchStops(query as string);

    const results = ptvStops
      .slice(0, Number(limit) || 50)
      .map((s) => ({
        name: s.displayName,
        position: s.position,
        transportTypes: s.routeType?.length ? s.routeType.map((t) => (["train", "tram", "bus"][t]) as TransportType) : (["train"] as TransportType[]),
      }));

    const response: ApiResponse<{ name: string; position: Coordinate; transportTypes: TransportType[] }[]> = {
      success: true,
      data: results,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
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

    if (!origin || !destination || !origin.lat || !origin.lng || !destination.lat || !destination.lng) {
      return res.status(400).json({
        success: false,
        error: "Invalid coordinates. Expected: { origin: {lat, lng}, destination: {lat, lng} }",
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

    // Normalise departure time: accept "HH:MM" or "HH:MM:SS", default to now
    const now = new Date();
    const resolvedDeparture = departureTime
      ? (departureTime.split(":").length === 2 ? departureTime + ":00" : departureTime)
      : `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`;

    const segments: (RouteSegment | FailedLeg)[] = [];
    let totalDistance = 0;
    let totalDuration = 0;

    if (strategy === "car") {
      const carRoute = await osrmRoute(origin, destination, waypoints?.map((w) => w.position));
      segments.push({
        type: "car",
        coordinates: carRoute.geometry,
        color: "#2196F3",
        distance: carRoute.distance,
        duration: carRoute.duration,
      });
      totalDistance = carRoute.distance;
      totalDuration = carRoute.duration;

    } else if (strategy === "ptv") {
      const stationStops = (waypoints || []).filter((w) => w.type === "station");
      if (stationStops.length < 1) {
        return res.status(400).json({
          success: false,
          error: "PTV routing requires at least one station stop. Add stations to your journey chain.",
          timestamp: new Date().toISOString(),
        });
      }

      // Build full point list: origin + all waypoints + destination
      const allPoints: Array<{ position: Coordinate; type: "station" | "place"; name: string }> = [
        { position: origin, type: "place", name: "Origin" },
        ...(waypoints || []).map((w) => ({ position: w.position, type: w.type, name: w.name || "" })),
        { position: destination, type: "place", name: "Destination" },
      ];

      let currentTime = resolvedDeparture;

      log(`[Route Calc] Strategy: ptv, waypoints: ${stationStops.length} station(s)`);
      log(`[Route Calc] All points:`, allPoints.map((p) => `${p.type}:${p.name}`).join(" -> "));

      for (let i = 0; i < allPoints.length - 1; i++) {
        const from = allPoints[i];
        const to = allPoints[i + 1];

        if (from.type === "station" && to.type === "station") {
          log(`[Route Calc] Leg ${i + 1}: PTV "${from.name}" -> "${to.name}"`);
          const ptv = await getPTVRoute(from.position, to.position, from.name, to.name);
          if (!ptv) {
            log(`[Route Calc] Leg ${i + 1}: FAILED`);
            segments.push({
              type: "failed",
              from: from.name,
              to: to.name,
            });
            continue;
          }

          log(`[Route Calc] Leg ${i + 1}: SUCCESS ${Math.round(ptv.duration / 60)}min, ${ptv.geometry.length} points`);
          const dist = calculateDistance(from.position, to.position);
          segments.push({
            type: "ptv",
            coordinates: ptv.geometry,
            color: "#F44336",
            distance: dist,
            duration: ptv.duration,
          });
          totalDistance += dist;
          totalDuration += ptv.duration;

          const parts = currentTime.split(":").map(Number);
          const baseSec = parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
          const nextSec = baseSec + Math.round(ptv.duration);
          const nh = Math.floor(nextSec / 3600) % 24;
          const nm = Math.floor((nextSec % 3600) / 60);
          currentTime = `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}:00`;
        } else {
          log(`[Route Calc] Leg ${i + 1}: Car "${from.name}" -> "${to.name}"`);
          const car = await osrmRoute(from.position, to.position);
          log(`[Route Calc] Leg ${i + 1}: Car ${Math.round(car.distance)}m, ${Math.round(car.duration)}s`);
          segments.push({
            type: "car",
            coordinates: car.geometry,
            color: "#2196F3",
            distance: car.distance,
            duration: car.duration,
          });
          totalDistance += car.distance;
          totalDuration += car.duration;
        }
      }

      log(`[Route Calc] Result: ${segments.length} legs, ${Math.round(totalDistance / 1000)}km, ${Math.round(totalDuration / 60)}min`);
    }

    const departureInfo = strategy !== "car"
      ? (await Promise.all(
          (waypoints || [])
            .filter((w) => w.type === "station" && w.name)
            .map(async (w) => {
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
          )).filter((d): d is DepartureInfo => d !== null)
         : undefined;

    const arrivalTime = new Date(Date.now() + totalDuration * 1000);

    const result: RouteResult = {
      segments,
      totalDistance,
      totalDuration,
      estimatedArrival: arrivalTime.toISOString(),
      departureInfo: departureInfo?.length ? departureInfo : undefined,
    };

    const response: ApiResponse<RouteResult> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
    const hasFailures = segments.some((s) => s.type === "failed");
    res.status(hasFailures ? 207 : 200).json(response);
  } catch (error) {
    console.error(error);
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

    const results = searchStreets(query as string, Number(limit) || 20);

    res.json({
      success: true,
      data: results,
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

    const results = nearbyStreets(
      { lat: Number(lat), lng: Number(lng) },
      Number(radius) || 200,
      Number(limit) || 20,
    );

    res.json({
      success: true,
      data: results,
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
