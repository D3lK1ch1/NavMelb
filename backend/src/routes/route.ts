import { Router, Request, Response } from "express";
import { ApiResponse, Coordinate, RouteSegment, RouteResult, RouteStrategy, Waypoint } from "../types";
import { calculateDistance, lookupDestinationAny, osrmRoute, chainJourneyLegs } from "../services/route-map.service";
import { getAllStops, TransportType } from "../services/gtfs-stop-indexservice";
import { findDeparturesForWaypoints } from "../services/gtfs-timetable.service";
import { searchStreets, nearbyStreets } from "../services/street-data.service";

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

    if (!strategy || !["car", "ptv", "park-and-ride"].includes(strategy)) {
      return res.status(400).json({
        success: false,
        error: "Invalid strategy. Must be: 'car', 'ptv', or 'park-and-ride'",
        timestamp: new Date().toISOString(),
      });
    }

    // Normalise departure time: accept "HH:MM" or "HH:MM:SS", default to now
    const now = new Date();
    const resolvedDeparture = departureTime
      ? (departureTime.split(":").length === 2 ? departureTime + ":00" : departureTime)
      : `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`;

    const segments: RouteSegment[] = [];
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
      const allStations = waypoints?.filter((w) => w.type === "station") || [];

      if (allStations.length < 2) {
        return res.status(400).json({
          success: false,
          error: "PTV routing requires at least 2 station stops. Add more stations to your journey.",
          timestamp: new Date().toISOString(),
        });
      }

      const stops = allStations.map((s) => ({ coord: s.position, name: s.name! }));
      console.log(`[Route Calc] PTV chain: ${stops.map((s) => s.name).join(" -> ")}`);

      const chain = chainJourneyLegs(stops, resolvedDeparture);

      if (!chain.ok) {
        return res.status(400).json({
          success: false,
          error: `No route found between "${chain.from}" and "${chain.to}". Please check your stops and try again.`,
          timestamp: new Date().toISOString(),
        });
      }

      for (let i = 0; i < chain.legs.length; i++) {
        const leg = chain.legs[i];
        const dist = calculateDistance(allStations[i].position, allStations[i + 1].position);
        segments.push({
          type: "ptv",
          coordinates: leg.geometry,
          color: "#F44336",
          distance: dist,
          duration: leg.duration,
        });
        totalDistance += dist;
        totalDuration += leg.duration;
      }

    } else if (strategy === "park-and-ride") {
      const stations = waypoints?.filter((w) => w.type === "station") || [];

      if (stations.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Park-and-ride requires at least one station waypoint.",
          timestamp: new Date().toISOString(),
        });
      }

      // Leg 1: drive from origin to first station
      console.log(`[Route Calc] Car: origin -> "${stations[0].name}"`);
      const carToFirst = await osrmRoute(origin, stations[0].position);
      segments.push({
        type: "car",
        coordinates: carToFirst.geometry,
        color: "#2196F3",
        distance: carToFirst.distance,
        duration: carToFirst.duration,
      });
      totalDistance += carToFirst.distance;
      totalDuration += carToFirst.duration;

      // Legs 2..N: transit through stations if there are at least 2
      if (stations.length >= 2) {
        const stops = stations.map((s) => ({ coord: s.position, name: s.name! }));
        console.log(`[Route Calc] PTV chain: ${stops.map((s) => s.name).join(" -> ")}`);

        // Offset departure time by the drive duration
        const driveArrivalSec = Math.round(carToFirst.duration);
        const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        const transitDepartureSec = nowSec + driveArrivalSec;
        const th = Math.floor(transitDepartureSec / 3600) % 24;
        const tm = Math.floor((transitDepartureSec % 3600) / 60);
        const transitDeparture = `${String(th).padStart(2, "0")}:${String(tm).padStart(2, "0")}:00`;

        const chain = chainJourneyLegs(stops, transitDeparture);

        if (!chain.ok) {
          return res.status(400).json({
            success: false,
            error: `No transit route found between "${chain.from}" and "${chain.to}". Please check your stops and try again.`,
            timestamp: new Date().toISOString(),
          });
        }

        for (let i = 0; i < chain.legs.length; i++) {
          const leg = chain.legs[i];
          const dist = calculateDistance(stations[i].position, stations[i + 1].position);
          segments.push({
            type: "ptv",
            coordinates: leg.geometry,
            color: "#F44336",
            distance: dist,
            duration: leg.duration,
          });
          totalDistance += dist;
          totalDuration += leg.duration;
        }
      }

      // Final leg: drive from last station to destination
      const lastStation = stations[stations.length - 1];
      console.log(`[Route Calc] Car: "${lastStation.name}" -> destination`);
      const carToEnd = await osrmRoute(lastStation.position, destination);
      segments.push({
        type: "car",
        coordinates: carToEnd.geometry,
        color: "#2196F3",
        distance: carToEnd.distance,
        duration: carToEnd.duration,
      });
      totalDistance += carToEnd.distance;
      totalDuration += carToEnd.duration;
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
