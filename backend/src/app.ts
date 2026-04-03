import express, { Express } from "express";
import cors from "cors";
import mapRoutes from "./routes/route";

/** Create and configure the Express app without starting the server or loading data. */
export function createApp(): Express {
  const app = express();
  app.use(cors({origin: ["http://localhost:8081", "http://localhost:3000"]}));
  app.use(express.json());

  app.get("/health", (_, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/map", mapRoutes);

  return app;
}
