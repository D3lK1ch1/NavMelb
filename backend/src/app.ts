import express, { Express } from "express";
import cors from "cors";
import mapRoutes from "./routes/route";
import { isGtfsStopsLoaded } from "./services/gtfs-stop-indexservice";
import { isRaptorLoaded } from "./services/gtfs-raptor-streaming.service";

/** Create and configure the Express app without starting the server or loading data. */
export function createApp(): Express {
  const app = express();
  const extraOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map(s => s.trim()) : [];
  app.use(cors({origin: ["http://localhost:8081", "http://localhost:3000", ...extraOrigins]}));
  app.use(express.json());

  app.get("/health", (_, res) => {
    const stopsReady = isGtfsStopsLoaded();
    const raptorReady = isRaptorLoaded();
    const status = stopsReady ? "ok" : "degraded";
    const httpStatus = stopsReady ? 200 : 503;
    res.status(httpStatus).json({
      status,
      timestamp: new Date().toISOString(),
      gtfs: {
        stops: stopsReady,
        raptor: raptorReady,
      },
    });
  });

  app.use("/api/map", mapRoutes);

  return app;
}
