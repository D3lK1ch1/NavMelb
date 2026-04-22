# NavMelb

A multimodal navigation app for Melbourne — combines car and public transport into a single chained journey. Built as a learning project to explore routing algorithms, GTFS timetable data, and mobile-first maps.

## Description

NavMelb is a mobile app showing the map, with buttons on the UI to choose where the user is now, choose between car or PTV to start routing, with Stations to search for the various stations according to the data stored for this map that will build the route between starting point and destination, allowing multiple waypoints and transport switch instead of choosing either / or with car and PTV.

Built with a Node.js backend for geocoding, RAPTOR based algorithm to calculaate pathways while running with GTFS data and a React Expo frontend working only on mobile to show the leaflet map.

---

## Current Features

- **Multimodal waypoint chaining** — mix car and PTV legs across any number of stops; station-to-station pairs route via GTFS timetable, everything else drives via OSRM
- **Partial route failure handling** — if one leg has no route, successful legs still display and the broken leg is flagged inline (HTTP 207)
- **Station search** — search GTFS stops by name and transport type (train / tram / bus), with route names and display names returned
- **Address geocoding** — place lookup via Nominatim, throttled and cached, bounded to Melbourne
- **Real GTFS travel times** — departure times computed from timetable data, threaded through each leg of a multi-stop journey
- **Raptor routing** — custom streaming Raptor implementation for multi-leg transit routing; falls back to timetable lookup if deadline exceeded
- **Map visualisation** — route segments rendered on Leaflet (OpenStreetMap) via WebView in Expo

---

## Built With

| Layer | Technology |
|-------|-----------|
| Mobile frontend | React Native (Expo) |
| Map rendering | Leaflet + OpenStreetMap (WebView) |
| Backend | Node.js + Express + TypeScript |
| Car routing | OSRM (self-hosted via Docker) |
| Transit routing | GTFS Schedule + custom Raptor implementation |
| Geocoding | Nominatim (OpenStreetMap) |
| Transit data | Victorian GTFS feeds (data.vic.gov.au) |

---

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm
- [Expo Go](https://expo.dev/go) installed on an Android or iOS device
- GTFS Schedule data (see below)
- Docker Desktop (for self-hosted OSRM)

### Installation

1. Clone the repository and install dependencies:

```bash
git clone <repo-url>
cd NavMelb
cd backend && npm install
cd ../frontend && npm install
```

2. **GTFS data** — not committed due to file size. Download from:

   > https://discover.data.vic.gov.au/dataset/gtfs-schedule

   Extract each feed zip into `backend/gtfs/` using this folder structure:

   | Folder | Feed | Transport type |
   |--------|------|---------------|
   | `1/google_transit.zip` | Metropolitan Train | Train |
   | `2/google_transit.zip` | Regional Train | Train |
   | `3/google_transit.zip` | Tram | Tram |
   | `4/google_transit.zip` | Bus | Bus |
   | `5/google_transit.zip` | Bus | Bus |
   | `6/google_transit.zip` | Bus | Bus |
   | `10/google_transit.zip` | Train | Train |
   | `11/google_transit.zip` | Bus | Bus |

3. **OSRM routing data** — not committed due to file size.

   Download an OSM extract for Australia or Victoria:
   > https://download.geofabrik.de/australia-oceania.html

   Save the `.osm.pbf` file into `osrm-data/`. Then pre-process (run once — takes 5–15 min):

   ```bash
   docker run -t -v "C:/path/to/NavMelb/osrm-data:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/<filename>.osm.pbf
   docker run -t -v "C:/path/to/NavMelb/osrm-data:/data" osrm/osrm-backend osrm-partition /data/<filename>.osrm
   docker run -t -v "C:/path/to/NavMelb/osrm-data:/data" osrm/osrm-backend osrm-customize /data/<filename>.osrm
   ```

   > Pre-processing is a one-time step. The processed files stay in `osrm-data/` and are reused on every subsequent start.

4. **Environment setup** — copy the example files and fill in your local IP:

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

   Then run the IP detection script (repeat this whenever DHCP reassigns your machine's IP):

   ```bash
   node set-local-ip.js
   ```

   This detects your current LAN IP and writes it into both `.env` files automatically. If you skip this and the IP has changed, all API calls will silently time out after 10 seconds.

5. **Start the backend and OSRM together:**

   ```bash
   docker compose up --build
   ```

   This starts both the OSRM routing server and the Node.js backend in one command. The backend is available on port `3000`; OSRM on port `5000`.

   > If OSRM is not running, the backend falls back to straight-line Haversine distance automatically.

   **Alternative — local dev without Docker:**

   ```bash
   # Terminal 1: start OSRM manually
   docker run -t -i -p 5000:5000 -v "C:/path/to/NavMelb/osrm-data:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/<filename>.osrm

   # Terminal 2: start backend in dev mode (hot reload)
   cd backend && npm run dev
   ```

6. Start the frontend:

```bash
cd frontend
npx expo start --lan --clear
```

Scan the QR code with Expo Go on your device.

> Note: This app uses React Native with Expo and cannot be rendered in a browser due to the WebView-based map component.

---

## Usage

To add on once sure of the quality.

---

## Roadmap

- [ ] Replace Raptor + GTFS with PTV API — swap point is `getPTVRoute()` in `route-map.service.ts`
- [x] Add CORS origin for production domain in `app.ts`
- [x] Fix `findStopByName` in `raptor-core.ts` — proximity sort to Melbourne CBD added 2026-04-19; full fix superseded by PTV API swap
- [ ] Wire timetable fallback when Raptor deadline is exceeded
- [ ] Create `journey-chain.service.ts` + `/journey/chain` endpoint
- [x] Waypoint list: add move up/down per-row buttons


**Optional / longer term:**
- [ ] Station parking availability lookup
- [ ] Lane tracking and traffic light configuration
- [ ] Walking path detail inside complex venues (shopping centres, campuses)
- [ ] GTFS-Realtime integration for live delay overlays

---

## License

TBD
