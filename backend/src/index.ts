import dotenv from "dotenv";
import { createApp } from "./app";
import { loadStreetData } from "./services/street-data.service";
import { loadGtfsStops } from "./services/gtfs-stop-indexservice";
import { loadRaptorStreaming } from "./services/gtfs-raptor-streaming.service";

dotenv.config();

const log = process.env.NODE_ENV !== "production" ? console.log : () => {};

async function bootstrap() {
  loadStreetData();

  // Load GTFS stop index eagerly so the planner is ready at startup
  try {
    log("[Bootstrap] Loading GTFS stops...");
    loadGtfsStops();
    log("[Bootstrap] GTFS stops loaded.");
  } catch (err) {
    console.error("[Bootstrap] Failed to load GTFS stops:", err);
    // Server starts but health endpoint will report 503 until data is available
  }

  // Load Raptor streaming planner (train timetable) — may be slow but runs concurrently
  loadRaptorStreaming().catch((err) => {
    console.error("[Bootstrap] Failed to load Raptor planner:", err);
  });

  const app = createApp();
  const PORT = 3000;

  app.listen(PORT, "0.0.0.0", () => {
    log(`Backend running on port ${PORT}`);
    log("Melbourne Navigation App - Backend");
    log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

bootstrap();
