import dotenv from "dotenv";
import { createApp } from "./app";
import { loadGtfsStops, loadRouteAssociations } from "./services/gtfs-stop-indexservice";
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

  // Load Raptor and route associations after the server is already accepting requests.
  // Station search and geocoding work immediately; these enrich results once ready.
  loadRaptorStreaming().catch((err) => {
    console.error("[Raptor] FATAL: Failed to load Raptor, continuing without it");
    console.error(err);
  });

  loadRouteAssociations().catch((err) => {
    console.error("[GTFS Routes] Failed to load route associations, continuing without route names");
    console.error(err);
  });
}

bootstrap();
