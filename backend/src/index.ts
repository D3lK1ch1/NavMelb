import dotenv from "dotenv";
import { createApp } from "./app";
import { loadStreetData } from "./services/street-data.service";

dotenv.config();

const log = process.env.NODE_ENV !== "production" ? console.log : () => {};

async function bootstrap() {
  loadStreetData();

  const app = createApp();
  const PORT = 3000;

  app.listen(PORT, "0.0.0.0", () => {
    log(`Backend running on port ${PORT}`);
    log("Melbourne Navigation App - Backend");
    log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

bootstrap();
