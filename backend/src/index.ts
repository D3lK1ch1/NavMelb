import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import phase1Routes from "./routes/route";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (_, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes (Phase-based)
app.use("/api/phase1", phase1Routes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`📍 Melbourne Navigation App - Backend`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
