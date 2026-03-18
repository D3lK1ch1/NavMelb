import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mapRoutes from "./routes/route";
import { loadGtfsStops } from "./services/gtfs-stop-indexservice";
import { loadGtfsTimetables } from "./services/gtfs-timetable.service";

dotenv.config();

async function bootstrap() {
  loadGtfsStops();
  await loadGtfsTimetables();

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/map", mapRoutes);

  const PORT = 3000;

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend running on port ${PORT}`);
    console.log("Melbourne Navigation App - Backend");
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

bootstrap();
