import { Router, Request, Response } from "express";
import { ApiResponse, Coordinate, TrafficLight } from "../types";
import {
  getAllTrafficLights,
  getTrafficLightsByBounds,
  calculateDistance,
  lookupPlace,
} from "../services/route-map.service";

const router = Router();

/**
 * GET /traffic-lights
 * Returns all traffic lights (MVP - mock data)
 */
router.get("/traffic-lights", (_req: Request, res: Response) => {
  try {
    const lights = getAllTrafficLights();
    const response: ApiResponse<TrafficLight[]> = {
      success: true,
      data: lights,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch traffic lights",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /traffic-lights/bounds?minLat=X&maxLat=X&minLng=X&maxLng=X
 * Returns traffic lights within view bounds
 */
router.get("/traffic-lights/bounds", (req: Request, res: Response) => {
  try {
    const { minLat, maxLat, minLng, maxLng } = req.query;

    if (!minLat || !maxLat || !minLng || !maxLng) {
      return res.status(400).json({
        success: false,
        error: "Missing bounds parameters (minLat, maxLat, minLng, maxLng)",
        timestamp: new Date().toISOString(),
      });
    }

    const lights = getTrafficLightsByBounds(
      parseFloat(minLat as string),
      parseFloat(maxLat as string),
      parseFloat(minLng as string),
      parseFloat(maxLng as string)
    );

    const response: ApiResponse<TrafficLight[]> = {
      success: true,
      data: lights,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch traffic lights",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /place/lookup?query=query
 * Returns lat/long for a place query
 */
router.get("/place/lookup", (req: Request, res: Response) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Missing query parameter",
        timestamp: new Date().toISOString(),
      });
    }

    const coordinates = lookupPlace(query as string);

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
      error: "Failed to lookup place",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /distance
 * Calculates distance between two coordinates
 */
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

export default router;
