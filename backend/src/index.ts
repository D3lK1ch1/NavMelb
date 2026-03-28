import dotenv from "dotenv";
import { createApp } from "./app";
import { loadGtfsStops } from "./services/gtfs-stop-indexservice";
import { loadGtfsTimetables} from "./services/gtfs-timetable.service";
import { loadRaptorStreaming } from "./services/gtfs-raptor-streaming.service";
import { loadStreetData } from "./services/street-data.service";

dotenv.config();

async function bootstrap() {
  loadGtfsStops();
  await loadGtfsTimetables();
  loadStreetData();

  const app = createApp();
  const PORT = 3000;

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend running on port ${PORT}`);
    console.log("Melbourne Navigation App - Backend");
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });

  // Load Raptor after the server is already accepting requests.
  // Station search and geocoding work immediately; Raptor routing
  // becomes available once the background load finishes.
  loadRaptorStreaming().catch((err) => {
    console.error("[Raptor] FATAL: Failed to load Raptor, continuing without it");
    console.error(err);
  });
}

bootstrap();
