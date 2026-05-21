import dotenv from "dotenv";
import { createApp } from "./app";
import { loadStreetData } from "./services/street-data.service";
import { registerSink } from "./events/dispatch";
import { NavEvent } from "./events/types";
import { createFileSink } from "./events/sinks/file-sink";

dotenv.config();

// File sink — always registered. Routes catastrophic/high events to log files.
registerSink(createFileSink());

// Console sink — dev only, shows all events for live visibility.
if (process.env.NODE_ENV !== "production") {
  registerSink((event: NavEvent) => {
    console.log(`[event] ${event.type}`, event);
  });
}

async function bootstrap() {
  loadStreetData();

  const app = createApp();
  const PORT = 3000;

  app.listen(PORT, "0.0.0.0", () => {
    if (process.env.NODE_ENV !== "production") {
      console.log(`Backend running on port ${PORT}`);
      console.log("Melbourne Navigation App - Backend");
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    }
  });
}

bootstrap();
