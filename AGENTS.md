## Agents Used
* Windsurf
* GitHub Copilot
* Gemini CLI
* Codex

This markdown is used throughout all projects, as rules and regulations to project across.

---

## Agent Guidelines
- Chatbots are allowed to improve and update this markdown
- Focus on incremental, validated changes
- Always cross-reference this file when starting new sessions
- Ensure the user follows the guidelines to research -> plan -> execute -> review -> revise
---

## Session Organization
- Maintain separate conversation folders per agent per project
- NavMelb project: `backend/` and `frontend/` with clear separation of concerns (as example)
- Each session should prefix decisions with agent name and timestamp

### Suggested Folder Structure for Sessions
```
NavMelb/
├── _sessions/
│   ├── copilot/
│   │   ├── 2025-02-08_phase1a_mapfoundation.md
│   │   └── 2025-02-09_phase1b_station_search.md
│   ├── windsurf/
│   │   └── 2025-02-08_api_optimization.md
│   ├── codex/
│   │   └── [future sessions]
│   └── gemini/
│       └── [future sessions]
├── backend/
├── frontend/
└── AGENTS.md
```

Each session file should document:
- **Date & Agent**: `[COPILOT] 2025-02-08`
- **Task**: What was requested
- **What Worked**: Implementations that succeeded
- **What Failed**: Issues encountered + root cause
- **Testing Results**: What was validated, what passed/failed
- **Next Steps**: Blockers or items for next session

---

## Core Instructions

- Find and read docs, give a boiler plate but not core functionality. 
- User is not allowed for poor planning, shallow understanding of the code, letting AI do what it wants etc

### Code Review & Quality
- **No comments in code** - explain decisions in chat during review
- **Outline exploration** - check Explorer to understand function signatures, inputs → outputs
- **KISS principle** - implement simplest solution first, avoid premature optimization, avoid overthinking with extra hooks, abstracts etc
- **Not overdefensive**  - no extra type escapes
- **Edge cases** - handle errors explicitly; no silent failures

### Testing & Validation Strategy
- User runs commands themselves (agents provide command guidance only)
- **Test before shipping**: unit tests for critical paths, integration tests for routes
- **Document test results**: what was tested, what passed/failed, improvements made

### Documentation Approach  
- No extra markdown files per change
- Summarize in chat: Problem → Solution → Validation Results
- Track what worked vs what didn't for pattern recognition
- No inconsistent files

---

## Known Issues & Fixes
| Issue | Root Cause | Solution | Status |
|-------|-----------|----------|--------|
| MapComponent WebView injection silent failures | JavaScript errors in injected code don't propagate to React | Add error callback to injectJavaScript, wrap in try-catch | not-started |
| API service doesn't retry on timeout | Axios configured with 10s timeout but no retry mechanism | Add retry-axios or implement exponential backoff | not-started |
| FrontendType `ParkingLot` not exported | Types defined in backend but missing in frontend | Export from frontend types/index.ts | not-started |
| Mock traffic lights in memory only | AllTrafficLights() returns static array, no persistence | Use SQLite for Phase 1, migrate to PostGIS P2 | not-started |
| No validation of coordinate bounds | Bounds query accepts any number, no earth-surface validation | Add lat [-90,90], lng [-180,180] validation in service | not-started |
| Unused dependencies in package.json | redis, pg imported but not used (Phase 2+ planning) | Remove from devDependencies until needed | not-started |
| Frontend .env EXPO_PUBLIC_API_URL fallback hardcoded | localhost:3001 won't work on iOS/Android devices | Update fallback to device IP or use .env.local per env | not-started |
| MapComponent region change handler not throttled | Fetches bounds on every region change event | Implement debounce on handleRegionChange (500ms) | not-started |

---

## Testing & Validation Log

### Tech Stack Implementation Audit

#### ✅ Implemented & Active
- **React Native + Expo** - runs on iOS/Android only (no web)
- **OSM (OpenStreetMap)** - via Leaflet.js in WebView, free tile layer at `https://tile.openstreetmap.org`
- **Express + Node.js** - backend health check + phase-based routes on port 3001
- **Turf.js** - distance calculations and geospatial math (both frontend & backend)
- **Axios** - centralized API client with 10s timeout (needs retry logic)
- **WebView + JavaScript injection** - maps Leaflet to React Native screens

#### ❌ Planned (Phase 2+)
| Component | Status | Reasoning |
|-----------|--------|-----------|
| PostgreSQL + PostGIS | Not installed | Needed for persistent traffic light/station/parking data |
| GraphQL | Not installed | For complex route calculation queries |
| Redis | Installed but unused | For caching + session management Phase 2+ |
| AWS/Cloud Infrastructure | Not deployed | Current: localhost only, Phase 2 needs hosting |
| TensorFlow Lite | Not integrated | For indoor positioning + walking direction disambiguation |
| PTV (Public Transport Victoria) API | Not integrated | For real public transport route data |

#### 🧹 Cleanup Needed
| Dependency | Current | Issue | Action |
|-----------|---------|-------|--------|
| `pg@8.11.3` | Backend | Imported but unused (Phase 2 planning) | Keep until Phase 2 starts |
| `redis@4.6.12` | Backend | Imported but unused (Phase 2 planning) | Keep until Phase 2 starts |
| `react-native-maps@1.14.0` | Frontend | Not used (using WebView + Leaflet instead) | Remove - using Leaflet approach instead |

### Backend
- [x] Route handlers - basic try-catch implemented, no unit tests
- [ ] Route-map service - integration tests needed (place lookup, distance calculation)  
- [ ] Type safety - TypeScript strict mode validation (tsconfig.json exists but strictness not verified)
- [ ] API responses - schema validation with actual data from bounds queries
- [ ] Error handling - edge cases: invalid coords, missing bounds params (has 400 validation), null responses

### Frontend
- [x] MapComponent - WebView-based Leaflet rendering works but needs stress testing:
  - [ ] Map region change events and bounds queries
  - [ ] Marker update injection via JavaScript (potential race conditions)
  - [ ] Loading states during traffic light fetch
- [x] MapExplorationScreen - state management implemented, needs testing:
  - [ ] Multiple place searches without reset
  - [ ] Distance calculation accuracy
  - [ ] Error recovery from API failures
- [ ] API service - axios client setup done, needs:
  - [ ] Timeout handling (10s timeout configured, needs validation)
  - [ ] Retry logic for failed requests
  - [ ] Network error handling
- [ ] Type exports - consistency check between backend/frontend types (currently aligned)
- [ ] React Native rendering - Android/iOS physical device testing (Expo required, web not supported)

### Known Gaps
- **No unit/integration tests** - test script in package.json echoes error
- **No database integration** - using mock data loaded in memory (Phase 2+)
- **WebView communication fragile** - JavaScript injection via injectJavaScript could fail silently
- **No API versioning** - hardcoded `/phase1/` prefix, no backward compatibility planned

---

## Code Quality Checklist
When implementing features:
- [ ] TypeScript: No `any` types (use proper typing)
- [ ] Error handling: try-catch or .catch() where applicable
- [ ] No unused imports or variables
- [ ] Function parameters fully typed
- [ ] Exported types match backend contracts
- [ ] Edge cases documented in chat

---

## Tech Stack Best Practices

### Backend (Node.js + TypeScript)
- Service layer for business logic (route-map.service.ts pattern)
- Route handlers → Services → Types hierarchy
- Error: Throw typed errors, handle in middleware

### Frontend (React Native + TypeScript)  
- Component hierarchy: Screens → Components → Services
- API service: Centralized requests with error handling
- Types: Shared with backend where applicable
- State: Keep local or use context for cross-screen data

---

## Progress Tracking

### Recent Work

**Phase 1a: Map Foundation** (Commits: d18ef30 "Showing off map", 1cbf91b "Cleaning up")
- ✅ Backend Express setup with health check endpoint
- ✅ Traffic lights API (`/phase1/traffic-lights`, `/phase1/traffic-lights/bounds`)
- ✅ Place lookup and distance calculation services
- ✅ Frontend MapComponent using Leaflet via WebView for React Native compatibility
- ✅ MapExplorationScreen with interactive place search
- ✅ Type alignment: `Coordinate`, `TrafficLight`, `RouteOption`, `Station`, `ApiResponse<T>`
- ✅ Mock traffic light data for Melbourne CBD (5 intersections)
- ✅ Error handling with try-catch in routes
- ✅ CORS and environment variable support (.env.example files)

**Timeline:**
- 5 days ago: Initial Expo React Native app + Backend init
- 20 hours ago: Map implementation & cleanups
- Current: Phase 1a complete, ready for Phase 1b expansion

---

## Repeating Mistakes Log
Track mistakes across agent conversations to avoid regression:
| Mistake | Occurrence | Prevention |
|---------|-----------|-----------|
| WebView JavascriptError not caught | MapComponent silently fails if Leaflet JS throws | Always add onError callback to WebView, test JS string syntax before injection |
| Type definitions drift between backend/frontend | Frontend ParkingLot missing, RouteOption may diverge | Run type comparison test: ensure backend types exported + imported in frontend, add CI check |
| Async state not cancelled in cleanup | Memory leak if component unmounts during API call, stale setState | Add AbortController in API service, check mounted ref in useEffect cleanup |
| Bounds validation missing | API accepts invalid coords (-37.5000, -37.9000 swapped), causes wrong results | Add minLat < maxLat assertion in getTrafficLightsByBounds service |
| Error responses not typed | API returns 400/500 responses without error payload contract | Define ErrorResponse interface in types, validate in error handler catch blocks |

--- 


