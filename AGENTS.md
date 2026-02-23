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
| Web libraries (react-leaflet) incompatible with React Native | DOM not available in RN environment, causes "document doesn't exist" error | Use WebView + injected Leaflet HTML (now implemented) | completed |
| API_BASE_URL pointing to Expo dev server instead of backend | Configuration confusion between exp:// (dev) and http:// (backend) | Use http://IP:PORT/api/map format (Copilot 2025-02-16) | completed |
| MapComponent not rendering on screen | Layout nesting in controlPanel with 50% maxHeight, {showMap} rendering boolean | Restructure layout: map above control panel, fix conditional render | completed |
| Tile layer URL typo | https:/// instead of https:// caused invalid tile requests | Fixed typo in Leaflet HTML injection (Copilot 2025-02-16) | completed |
| MapComponent WebView injection silent failures | JavaScript errors in injected code don't propagate to React | Add onError callback to WebView, wrap Leaflet init in try-catch | in-progress |
| API service doesn't retry on timeout | Axios configured with 10s timeout but no retry mechanism | Add retry-axios or implement exponential backoff | not-started |
| FrontendType `ParkingLot` not exported | Types defined in backend but missing in frontend | Export from frontend types/index.ts | not-started |
| Mock traffic lights in memory only | AllTrafficLights() returns static array, no persistence | Use SQLite for Phase 1, migrate to PostGIS P2 | not-started |
| No validation of coordinate bounds | Bounds query accepts any number, no earth-surface validation | Add lat [-90,90], lng [-180,180] validation in service | not-started |
| Unused dependencies in package.json | ~~redis, pg~~ react-leaflet imported but not used | Removed react-leaflet, @types/leaflet, react-native-maps (Copilot 2025-02-16) | completed |
| MapComponent region change handler not throttled | Fetches bounds on every region change event | Implement debounce on handleRegionChange (500ms) | not-started |
| Port conflict (Expo vs Backend) | Both default to 8081, causing 404s on API calls hitting Expo | Move Backend to port 3000, update .env | completed |

---

## Testing & Validation Log

### Tech Stack Implementation Audit

#### ✅ Implemented & Active
- **React Native + Expo** - runs on iOS/Android only (no web)
- **OSM (OpenStreetMap)** - via Leaflet.js in WebView, free tile layer at `https://tile.openstreetmap.org`
- **Express + Node.js** - backend health check + phase-based routes on port 3000
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
| Dependency | Current | Issue | Action | Status |
|-----------|---------|-------|--------|--------|
| `pg@8.11.3` | Backend | Imported but unused (Phase 2 planning) | Keep until Phase 2 starts | - |
| `redis@4.6.12` | Backend | Imported but unused (Phase 2 planning) | Keep until Phase 2 starts | - |
| ~~`react-native-maps@1.14.0`~~ | ~~Frontend~~ | ~~Not used (using WebView + Leaflet)~~ | ~~Removed~~ | ✅ Copilot 2025-02-16 |
| ~~`react-leaflet@5.0.0`~~ | ~~Frontend~~ | ~~DOM errors in React Native~~ | ~~Removed~~ | ✅ Copilot 2025-02-16 |
| ~~`@types/leaflet@1.9.21`~~ | ~~Frontend~~ | ~~Web lib types not needed~~ | ~~Removed~~ | ✅ Copilot 2025-02-16 |
| ~~`react-dom@19.1.0`~~ | ~~Frontend~~ | ~~Web only, not for RN~~ | ~~Removed~~ | ✅ Copilot 2025-02-16 |

### Backend
- [x] Route handlers - basic try-catch implemented, no unit tests
- [ ] Route-map service - integration tests needed (place lookup, distance calculation)  
- [ ] Type safety - TypeScript strict mode validation (tsconfig.json exists but strictness not verified)
- [ ] API responses - schema validation with actual data from bounds queries
- [ ] Error handling - edge cases: invalid coords, missing bounds params (has 400 validation), null responses

### Frontend
- [x] MapComponent - WebView-based Leaflet rendering working (Copilot 2025-02-16):
  - [x] Layout restructured to render above control panel
  - [x] Tile layer URL fixed (https:// typo resolved)
  - [x] Leaflet HTML injected successfully via WebView
  - [ ] Map region change events and bounds queries (TODO)
  - [ ] Marker update injection via JavaScript (potential race conditions)
  - [ ] Loading states during traffic light fetch
  - [ ] WebView onError callback for silent failures
- [x] MapExplorationScreen - state management implemented, layout fixed:
  - [x] Conditional rendering of map fixed ({showMap} boolean issue)
  - [ ] Multiple place searches without reset
  - [ ] Distance calculation accuracy
  - [ ] Error recovery from API failures
- [x] API service - axios client configured correctly:
  - [x] API_BASE_URL points to backend (http://192.168.0.103:8081/api/map)
  - [ ] Timeout handling (10s timeout configured, needs validation)
  - [ ] Retry logic for failed requests
  - [ ] Network error handling
- [ ] Type exports - consistency check between backend/frontend types (currently aligned)
- [ ] React Native rendering - Android/iOS physical device testing (Expo required, web not supported)

### Known Gaps
- **No unit/integration tests** - test script in package.json echoes error
- **No database integration** - using mock data loaded in memory (Phase 2+)
- **WebView error handling** - Leaflet JS errors wrapped in try-catch but no React-side error callback yet (in-progress)
- **No API versioning** - hardcoded `/api/map` prefix, no backward compatibility planned
- **No marker injection** - MapComponent accepts markers prop but doesn't update after initial render

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
- ✅ Traffic lights API (`/api/map` routes)
- ✅ Place lookup and distance calculation services
- ✅ Frontend MapComponent using Leaflet via WebView for React Native compatibility
- ✅ MapExplorationScreen with interactive place search
- ✅ Type alignment: `Coordinate`, `TrafficLight`, `RouteOption`, `Station`, `ApiResponse<T>`
- ✅ Mock traffic light data for Melbourne CBD
- ✅ Error handling with try-catch in routes
- ✅ CORS and environment variable support (.env.example files)

**[COPILOT] 2025-02-16 - Frontend/Backend Integration Testing & Fixes**
- **Task**: Test backend connectivity with Expo Go; fix rendering and API issues
- **What Worked**: 
  - Backend running on port 8081 with CORS enabled
  - WebView + injected Leaflet HTML approach (correct for React Native)
  - Layout restructure (map above control panel) fixed visibility
  - Fixed API URL configuration (http:// not exp://)
- **What Failed**:
  - MapComponent using react-leaflet (web lib) → "document doesn't exist" error
  - Tile layer URL typo (https:/// instead of https://)
  - API_BASE_URL pointed to Expo dev server instead of backend
  - JSX error: {showMap} rendering boolean value
  - Layout: MapComponent nested in controlPanel with maxHeight:50% made it invisible
- **What Fixed**:
  - Deleted react-leaflet, @types/leaflet, react-native-maps, react-dom
  - Rewrote MapComponent to use WebView with Leaflet HTML injection
  - Fixed tile layer URL typo
  - Fixed {showMap} to conditional render with &&
  - Restructured layout: map above control panel
  - Updated API_BASE_URL to http://192.168.0.103:8081/api/map
- **Testing Results**: Map renders on Expo Go, search queries now reach backend (404 errors resolved)
- **Next Steps**: Add WebView onError handler, test markers injection, validate distance calculations

**Timeline:**
- 5 days ago: Initial Expo React Native app + Backend init
- 20 hours ago: Map implementation & cleanups
- 2025-02-16: Frontend/backend integration issues + full recovery (Copilot session)
- Current: Phase 1a functional, testing Phase 1b place search

**[GEMINI] 2026-02-20 - Environment Configuration**
- **Task**: Create .env file for API_BASE_URL to facilitate physical device testing
- **What Worked**: 
  - Created `frontend/.env` with `EXPO_PUBLIC_API_BASE_URL`
  - Updated `api.ts` to consume environment variable
- **Next Steps**: Verify connectivity on physical device

**[CODEX] 2026-02-23 - Git Ignore Hygiene (Root + Backend)**
- **Task**: Reduce noisy git changes and avoid repeatedly adding generated backend/frontend files.
- **What Worked**:
  - Confirmed root `.gitignore` can cover the entire repo (`node_modules/`, build artifacts, logs, env variants).
  - Added `backend/.gitignore` to make backend ignore intent explicit during transition.
  - Identified root cause of noise: `backend/node_modules` was already tracked in git, so ignore rules were not being applied.
  - Provided cleanup command flow using `git rm -r --cached` to untrack dependencies while keeping files locally.
- **What Failed**:
  - Relying on `.gitignore` alone did not hide existing tracked files.
- **Testing Results**:
  - Verified with `git status --short` that backend dependency files were tracked and causing large modified/deleted lists.
  - Verified tracked file count under `backend/node_modules` before cleanup.
- **Next Steps**:
  - Run one-time untrack commands for `backend/node_modules` and `frontend/node_modules`.
  - Keep a single root `.gitignore` as source of truth (or keep per-folder files only if team prefers local clarity).

---

## Repeating Mistakes Log
Track mistakes across agent conversations to avoid regression:
| Mistake | Occurrence | Prevention | Updated |
|---------|-----------|-----------|----------|
| Using web libraries in React Native | MapComponent used react-leaflet (DOM-based) instead of WebView | Always verify library target (web vs RN) before importing | Copilot 2025-02-16 |
| Configuration confusion (dev vs backend) | API_BASE_URL pointed to exp:// (Expo dev) instead of http:// (backend) | Document dev server port vs backend port separately in .env.example | Copilot 2025-02-16 |
| Layout nesting causing hidden components | MapComponent inside controlPanel with maxHeight:50% made it invisible | Check flex layout hierarchy before nesting components | Copilot 2025-02-16 |
| URL typos in injected HTML | Tile layer had https:/// instead of https:// | Validate string interpolation in template literals before injection | Copilot 2025-02-16 |
| JSX rendering non-component values | {showMap} rendered boolean instead of conditional component | Validate JSX expressions: only render components/elements, not primitives | Copilot 2025-02-16 |
| WebView JavascriptError not caught | MapComponent silently fails if Leaflet JS throws | Always add onError callback to WebView, test JS string syntax before injection | - |
| Type definitions drift between backend/frontend | Frontend ParkingLot missing, RouteOption may diverge | Run type comparison test: ensure backend types exported + imported in frontend, add CI check | - |
| Async state not cancelled in cleanup | Memory leak if component unmounts during API call, stale setState | Add AbortController in API service, check mounted ref in useEffect cleanup | - |
| Bounds validation missing | API accepts invalid coords (-37.5000, -37.9000 swapped), causes wrong results | Add minLat < maxLat assertion in getTrafficLightsByBounds service | - |
| Error responses not typed | API returns 400/500 responses without error payload contract | Define ErrorResponse interface in types, validate in error handler catch blocks | - |
| Expecting `.gitignore` to hide already tracked dependencies | `node_modules` was committed previously, so git keeps showing changes | Run one-time `git rm -r --cached <path>/node_modules` then commit ignore rules | Codex 2026-02-23 |

--- 
