import path from "path";
import { createApp } from "../../app";
import { loadStreetData } from "../../services/street-data.service";
import type { Express } from "express";

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");

export async function createTestApp(): Promise<Express> {
  loadStreetData(path.join(FIXTURES_DIR, "street-names.geojson"));
  return createApp();
}
