import { Router, Request, Response } from "express";
import { ApiResponse, Coordinate} from "../types";
import {calculateDistance,lookupDestination} from "../services/route-map.service";

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

export default router;
