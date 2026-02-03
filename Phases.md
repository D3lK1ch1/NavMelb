## Behaviours & Prototype Steps

### Phase 1: Foundation Map Layer (Weeks 1-2)
**Goal**: Static map with lane/traffic overlay

**Week 1a - Map Foundation**:
1. Set up React Native + Mapbox GL project
2. Create base map component showing Melbourne
3. Integrate Mapbox vector tiles
4. Test lane rendering on major roads (Princes St, City Rd)

**Week 1b - Traffic Light Overlay**:
1. Create GeoJSON mock traffic light data (20 intersections)
2. Render traffic lights as SVG icons at intersections
3. Add UI toggle for traffic light visibility
4. Implement static traffic state (red/green/amber)

**Week 2 - Geo Calculations**:
1. Integrate Turf.js for distance/direction calculations
2. Implement place search (Nominatim for lat/long lookup)
3. Add two-point distance measurement
4. Test direction calculation accuracy

**Debug Checklist**: Tile rendering performance, device compatibility (iOS/Android), memory usage at different zoom levels

---

### Phase 2: Multimodal Routing (Weeks 3-5)
**Goal**: Car + PTV route options

**Week 3 - Backend Routing Service**:
1. Create Express API with `/route` endpoint
2. Integrate OSRM (Open Source Routing Machine) for car routes
3. Connect to PTV API for public transport data
4. Implement route comparison logic (car vs PTV vs combined)
5. Add station lookup endpoint

**Week 4 - Frontend Route Display**:
1. Draw polyline routes (car route in blue, PTV in purple)
2. Add route info cards (duration, distance, cost)
3. Implement station selector UI
4. Display car→station + station→destination breakdown
5. Add route preference toggles

**Week 5 - Optimization & Caching**:
1. Implement Redis caching for frequent routes
2. Batch API requests to reduce call count
3. Handle edge cases (no PTV after midnight, no direct routes)
4. Optimize response time (<2s target)

**Debug Checklist**: Route validation against Google Maps, offline fallback testing, API response time monitoring

---

### Phase 3: Parking Integration (Weeks 6-7)
**Goal**: Show parking near chosen stations

**Week 6 - Data Pipeline**:
1. Integrate Melbourne Council parking APIs
2. Design PostGIS schema for parking metadata (location, capacity, availability)
3. Create data ingestion service (hourly updates)
4. Create `/nearby-parking` endpoint with distance filtering
5. Store real-time availability in PostgreSQL

**Week 7 - Frontend Display & Integration**:
1. Add parking icons to map with availability indicators
2. Filter parking by distance from selected station
3. Display parking details (name, capacity, cost)
4. Integrate with Phase 2 route (suggest parking alongside route)
5. Add booking/external link integration

**Debug Checklist**: Parking coordinate accuracy, API rate limit handling, data freshness validation

---

### Phase 4: Indoor Walking Improvements
**Goal**: Walking clarity in shopping centers/uni campus

**Week 8 - Indoor Map Integration**:
1. Integrate Mapwize SDK
2. Load Melbourne campus/shopping center floor maps
3. Implement TensorFlow Lite positioning model

**Week 9 - Walking Directions**:
1. Convert outdoor to indoor route transitions
2. Generate floor-level turn-by-turn directions
3. Add augmented reality (AR) preview option

## Test Cases 
* Phase 1: Completely show Melbourne, with suburbs as a simple embedded map. Showcasing functions where lat-long of place is found, direction and distance between two places, lanes and traffic etc. Identical to a combination of Apple Maps and Google Maps. Able to download on phone, and work similarly to Apple Maps / Google Maps for just Melbourne.
  - **MVP Test**: Load map in <3s, pan/zoom smooth, traffic lights render on major intersections
  - **Coverage Test**: Show all suburbs, test 50 random coordinate lookups, validate distances within 1% accuracy
  
* Phase 2: Shows car route between two places. Shows PTV route between two places. User who wants to take the nearest station by car to use train to go for ex. the city, so user chooses PTV + car option and given the option to choose station for PTV, so that user can calculate car route to station, then train to destination.
  - **MVP Test**: Route calculation <2s, show 3 route options (car, PTV, combined)
  - **Validation Test**: Compare results with Google Maps (within 10% time variance), verify station selection logic
  
* Phase 3: Parking integration correlated to phase 2, making sure that there are parking near stations chosen.
  - **MVP Test**: Display parking within 500m of selected station, show availability status
  - **Accuracy Test**: Manually verify 10 parking locations, confirm capacity/pricing accuracy
  
* Phase 4: Indoor walking directions with floor-level navigation and AR preview in shopping centers/campuses