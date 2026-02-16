import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mapRoutes from "./routes/route";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (_, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes (Map API)
app.use("/api/map", mapRoutes);

const PORT = 8081;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on port ${PORT}`);
  console.log("Melbourne Navigation App - Backend");
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
