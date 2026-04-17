import express, { Express } from "express";
import cors from "cors";
import mapRoutes from "./routes/route";

/** Create and configure the Express app without starting the server or loading data. */
export function createApp(): Express {
  const app = express();
  const extraOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map(s => s.trim()) : [];
  app.use(cors({origin: ["http://localhost:8081", "http://localhost:3000", ...extraOrigins]}));
  app.use(express.json());

  app.get("/health", (_, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/map", mapRoutes);

  return app;
}
