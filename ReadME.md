# NavMelb

A multimodal navigation app for Melbourne — combines car and public transport into a single chained journey. Built to explore transit routing with live timetable data in a mobile app with manual waypoints for easier tracking journey.

## Description

NavMelb is a mobile app showing the map, with buttons on the UI to choose where the user is now, choose between car or PTV to start routing, with Stations to search for the various stations according to the data stored for this map that will build the route between starting point and destination, allowing multiple waypoints and transport switch instead of choosing either / or with car and PTV.

Built with a Node.js backend for geocoding, changing from RAPTOR + GTFS to PTV API for fresher data in beta production with plans to revisit RAPTOR as an algorithm fr better routing and a React Expo frontend working only on mobile to show the leaflet map.

---

## Try it (v0 beta)

![Scan with Expo Go](https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=exp%3A%2F%2Fu.expo.dev%2F3553a64a-f0e1-49f0-843e-844022db43b6%3Fchannel-name%3Dpreview)

Requires [Expo Go](https://expo.dev/go) on Android or iOS. Create a free [Expo account](https://expo.dev/signup) first, then scan the QR.

**Train routing works. Tram and bus routing are in progress.**

---

## Report a bug or request a feature

[Open an issue](https://github.com/D3lK1ch1/NavMelb/issues) — check existing issues first to avoid duplicates.

**Known limitations in v0:**
- Tram and bus routing not yet working (shows as car leg)
- Transfer routing requires manually adding intermediate station stops
- Walking legs estimated as car distance
- Car legs use straight-line estimate

---

## Current Features

- **Multimodal waypoint chaining** — mix car and PTV legs across any number of stops; station-to-station pairs route via PTV API, everything else uses straight-line car estimate
- **Partial route failure handling** — if one leg has no route, successful legs still display and the broken leg is flagged inline (HTTP 207)
- **Station search** — search PTV API stops by name and transport type (train / tram / bus), with route names and display names returned
- **Address geocoding** — place lookup via Nominatim, throttled and cached, bounded to Melbourne
- **Map visualisation** — route segments rendered on Leaflet (OpenStreetMap) via WebView in Expo

---

## Built With

| Layer | Technology |
|-------|-----------|
| Mobile frontend | React Native (Expo) |
| Map rendering | Leaflet + OpenStreetMap (WebView) |
| Backend | Node.js + Express + TypeScript |
| Car routing | Haversine straight-line estimate (OSRM optional, self-hosted) |
| Transit routing | PTV Timetable API |
| Geocoding | Nominatim (OpenStreetMap) |

---

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm
- [Expo Go](https://expo.dev/go) installed on an Android or iOS device
- Docker Desktop (for self-hosted OSRM)

### Installation

1. Clone the repository and install dependencies:

```bash
git clone <repo-url>
cd NavMelb
cd backend && npm install
cd ../frontend && npm install
```

2. **OSRM routing data** — not committed due to file size.

   Download an OSM extract for Australia or Victoria:
   > https://download.geofabrik.de/australia-oceania.html

   Save the `.osm.pbf` file into `osrm-data/` (any filename is fine). Pre-processing runs automatically the first time you start the stack — no extra commands needed.

3. **Environment setup** — copy the example files and fill in your local IP:

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

   **Alternative — backend hot reload:**

   ```bash
   # Terminal 1: start OSRM only
   docker compose up osrm

   # Terminal 2: backend with hot reload
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

- [ x ] Replace Raptor + GTFS with PTV API — swap point is `getPTVRoute()` in `route-map.service.ts`
- [ ] Tram routing - frontend stratergy selection fix in progress
- [ ] Bus routing - follows from tram fix
- [ ] Deploy to Fly.io + Expo Go QR Code


**Longer term:**
- [ ] Transfer routing without manual intermediate stops 
- [ ] Walking path detail inside complex venues (shopping centres, campuses)
- [ ] PTV promixity alert - audio alert when approaching destination stop

---

## License

TBD
