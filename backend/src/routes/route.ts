import { Router, Request, Response } from "express";
import { ApiResponse, Coordinate, RouteSegment } from "../types";
import {calculateDistance, lookupDestination, osrmRoute, getTrainRoute} from "../services/route-map.service";
import { getAllStops } from "../services/gtfs-stop-indexservice";

const router = Router();

router.get("/destination/lookup", (req: Request, res: Response) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Missing query parameter",
        timestamp: new Date().toISOString(),
      });
    }

    const coordinates = lookupDestination(query as string);

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
    const { query, limit } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Missing query parameter",
        timestamp: new Date().toISOString(),
      });
    }

    const allStops = getAllStops();
    const searchTerm = (query as string).toLowerCase();
    const results = allStops
      .filter((s) => s.name.toLowerCase().includes(searchTerm))
      .slice(0, Number(limit) || 10);

    const response: ApiResponse<{ name: string; position: Coordinate }[]> = {
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
    const { from, to, viaStations, routeType } = req.body;

    if (!from || !to || !from.lat || !from.lng || !to.lat || !to.lng) {
      return res.status(400).json({
        success: false,
        error: "Invalid coordinates. Expected: { from: {lat, lng}, to: {lat, lng} }",
        timestamp: new Date().toISOString(),
      });
    }

    const segments: RouteSegment[] = [];
    let totalDistance = 0;
    let totalDuration = 0;

    if (routeType === "car") {
      const carRoute = await osrmRoute(from, to);
      segments.push({
        type: "car",
        coordinates: carRoute.geometry,
        color: "#2196F3",
        distance: carRoute.distance,
        duration: carRoute.duration,
      });
      totalDistance = carRoute.distance;
      totalDuration = carRoute.duration;
    } else if (routeType === "train" && viaStations && viaStations.length >= 2) {
      let prevStation = from;
      for (const station of viaStations) {
        const trainLine = getTrainRoute(prevStation, station);
        const dist = calculateDistance(prevStation, station);
        segments.push({
          type: "train",
          coordinates: trainLine,
          color: "#F44336",
          distance: dist,
          duration: (dist / 1000 / 60) * 3600,
        });
        totalDistance += dist;
        prevStation = station;
      }
      const finalTrain = getTrainRoute(prevStation, to);
      const finalDist = calculateDistance(prevStation, to);
      segments.push({
        type: "train",
        coordinates: finalTrain,
        color: "#F44336",
        distance: finalDist,
        duration: (finalDist / 1000 / 60) * 3600,
      });
      totalDistance += finalDist;
    } else if (routeType === "combined" && viaStations && viaStations.length > 0) {
      let currentPos = from;
      for (const station of viaStations) {
        const carRoute = await osrmRoute(currentPos, station);
        segments.push({
          type: "car",
          coordinates: carRoute.geometry,
          color: "#2196F3",
          distance: carRoute.distance,
          duration: carRoute.duration,
        });
        totalDistance += carRoute.distance;
        totalDuration += carRoute.duration;
        currentPos = station;
      }
      const finalCarRoute = await osrmRoute(currentPos, to);
      segments.push({
        type: "car",
        coordinates: finalCarRoute.geometry,
        color: "#2196F3",
        distance: finalCarRoute.distance,
        duration: finalCarRoute.duration,
      });
      totalDistance += finalCarRoute.distance;
      totalDuration += finalCarRoute.duration;
    } else {
      const carRoute = await osrmRoute(from, to);
      segments.push({
        type: "car",
        coordinates: carRoute.geometry,
        color: "#2196F3",
        distance: carRoute.distance,
        duration: carRoute.duration,
      });
      totalDistance = carRoute.distance;
      totalDuration = carRoute.duration;
    }

    const response: ApiResponse<{
      segments: RouteSegment[];
      totalDistance: number;
      totalDuration: number;
    }> = {
      success: true,
      data: { segments, totalDistance, totalDuration },
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
