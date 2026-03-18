import { Router, Request, Response } from "express";
import { ApiResponse, Coordinate, RouteSegment, RouteResult, RouteStrategy, Waypoint } from "../types";
import {calculateDistance, lookupDestinationAny, osrmRoute, getPTVRoute} from "../services/route-map.service";
import { getAllStops, TransportType } from "../services/gtfs-stop-indexservice";
import { loadGtfsTimetables, findDeparturesForWaypoints } from "../services/gtfs-timetable.service";

loadGtfsTimetables();

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

router.post(
  "/distance",
  (req: Request, res: Response) => {
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

      const response: ApiResponse<{
        distance: number;
        distanceKm: number;
        unit: string;
      }> = {
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
  }
);

router.get("/stations/search", (req: Request, res: Response) => {
  try {
    const { query, limit, transportType } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Missing query parameter",
        timestamp: new Date().toISOString(),
      });
    }

    let stops = getAllStops();
    if (transportType && ["tram", "train", "bus"].includes(transportType as string)) {
      stops = stops.filter((s) => s.transportTypes.includes(transportType as TransportType));
    }

    const normalizedQuery = (query as string)
      .toLowerCase()
      .trim()
      .replace(/\bstation\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const results = stops
      .filter((s) => s.name.includes(normalizedQuery))
      .slice(0, Number(limit) || 50);

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
    const { origin, destination, waypoints, strategy } = req.body as {
      origin: Coordinate;
      destination: Coordinate;
      waypoints?: Waypoint[];
      strategy: RouteStrategy;
    };

    if (!origin || !destination || !origin.lat || !origin.lng || !destination.lat || !destination.lng) {
      return res.status(400).json({
        success: false,
        error: "Invalid coordinates. Expected: { origin: {lat, lng}, destination: {lat, lng} }",
        timestamp: new Date().toISOString(),
      });
    }

    if (!strategy || !["car", "ptv", "park-and-ride"].includes(strategy)) {
      return res.status(400).json({
        success: false,
        error: "Invalid strategy. Must be: 'car', 'ptv', or 'park-and-ride'",
        timestamp: new Date().toISOString(),
      });
    }

    const segments: RouteSegment[] = [];
    let totalDistance = 0;
    let totalDuration = 0;

    if (strategy === "car") {
      const carRoute = await osrmRoute(origin, destination, waypoints?.map(w => w.position));
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
      const allStations = waypoints?.filter(w => w.type === "station") || [];
      if (allStations.length < 2) {
        return res.status(400).json({
          success: false,
          error: "PTV routing requires at least 2 stations as waypoints",
          timestamp: new Date().toISOString(),
        });
      }

      let prevPoint = origin;
      for (const station of allStations) {
        const ptRoute = getPTVRoute(prevPoint, station.position);
        const dist = calculateDistance(prevPoint, station.position);
        segments.push({
          type: "ptv",
          coordinates: ptRoute,
          color: "#F44336",
          distance: dist,
          duration: (dist / 1000 / 60) * 3600,
        });
        totalDistance += dist;
        totalDuration += (dist / 1000 / 60) * 3600;
        prevPoint = station.position;
      }

      const finalRoute = getPTVRoute(prevPoint, destination);
      const finalDist = calculateDistance(prevPoint, destination);
      segments.push({
        type: "ptv",
        coordinates: finalRoute,
        color: "#F44336",
        distance: finalDist,
        duration: (finalDist / 1000 / 60) * 3600,
      });
      totalDistance += finalDist;
      totalDuration += (finalDist / 1000 / 60) * 3600;
    } else if (strategy === "park-and-ride") {
      const stations = waypoints?.filter(w => w.type === "station") || [];
      if (stations.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Park-and-ride requires at least one station as waypoint",
          timestamp: new Date().toISOString(),
        });
      }

      let currentPos = origin;

      const carToFirst = await osrmRoute(currentPos, stations[0].position);
      segments.push({
        type: "car",
        coordinates: carToFirst.geometry,
        color: "#2196F3",
        distance: carToFirst.distance,
        duration: carToFirst.duration,
      });
      totalDistance += carToFirst.distance;
      totalDuration += carToFirst.duration;
      currentPos = stations[0].position;

      for (let i = 0; i < stations.length - 1; i++) {
        const fromStation = stations[i];
        const toStation = stations[i + 1];
        const ptRoute = getPTVRoute(fromStation.position, toStation.position);
        const dist = calculateDistance(fromStation.position, toStation.position);
        segments.push({
          type: "ptv",
          coordinates: ptRoute,
          color: "#F44336",
          distance: dist,
          duration: (dist / 1000 / 60) * 3600,
        });
        totalDistance += dist;
        totalDuration += (dist / 1000 / 60) * 3600;
        currentPos = toStation.position;
      }

      const finalRoute = getPTVRoute(currentPos, destination);
      const finalDist = calculateDistance(currentPos, destination);
      segments.push({
        type: "ptv",
        coordinates: finalRoute,
        color: "#F44336",
        distance: finalDist,
        duration: (finalDist / 1000 / 60) * 3600,
      });
      totalDistance += finalDist;
      totalDuration += (finalDist / 1000 / 60) * 3600;
    }

    const departureInfo = strategy !== "car" 
      ? findDeparturesForWaypoints(waypoints || [])
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
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to calculate route",
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
