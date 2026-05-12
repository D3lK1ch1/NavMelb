import express, { Express } from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import mapRoutes from "./routes/route";

/** Create and configure the Express app without starting the server or loading data. */
export function createApp(): Express {
  const app = express();
  const extraOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map(s => s.trim()) : [];
  app.use(cors({origin: ["http://localhost:8081", "http://localhost:3000", ...extraOrigins]}));
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: process.env.NODE_ENV === "test" ? 10_000 : 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: "Too many requests, please try again later",
        timestamp: new Date().toISOString(),
      });
    },
  });

  app.use("/api", apiLimiter);
  app.use("/api/map", mapRoutes);

  return app;
}
