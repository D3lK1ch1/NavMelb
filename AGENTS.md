## Agents Used
* Windsurf
* GitHub Copilot
* Gemini CLI
* Codex

---

## Agent Guidelines
- Chatbots are allowed to improve and update this markdown
- Focus on incremental, validated changes
- Always cross-reference this file when starting new sessions
- Ensure the user follows the guidelines to research → plan → execute → review → revise

---

## Core Instructions

- Find and read docs, give a boiler plate but not core functionality
- User is not allowed for poor planning, shallow understanding of the code, letting AI do what it wants

### Code Review & Quality
- **No comments in code** — explain decisions in chat during review
- **Outline exploration** — check function signatures, inputs → outputs before touching anything
- **KISS principle** — simplest solution first; no premature abstractions, extra hooks, or over-engineering
- **DRY principle** - do not repeat extra functions unnecessaarily.
- **Not overdefensive** — no extra type escapes
- **Edge cases** — handle errors explicitly; no silent failures

### Testing & Validation Strategy
- User runs commands themselves — agents provide command guidance only
- **Test before shipping**: unit tests for critical paths, integration tests for routes
- See `.claude/agents/testing.md` for framework setup (Jest + ts-jest / jest-expo)

### Documentation Approach
- No extra markdown files per change
- Summarize in chat: Problem → Solution → Validation Results
- Session notes go in `notes/sessions/YYYY-MM-DD.md` — not here

---

## Known Issues
| Issue | Root Cause | Solution | Status |
|-------|-----------|----------|--------|
| WebView onError not handled | Leaflet JS errors don't propagate to React | Add onError callback to WebView | in-progress |
| GTFS stop name mismatch across feeds | Feeds name same stop differently | Cross-reference by coordinate proximity at load time | not-started |
| API service no retry on timeout | Axios 10s timeout, no backoff | Add retry-axios or exponential backoff | not-started |
| CORS blocks physical device | Whitelist is localhost-only | Read `CORS_ORIGIN` from `backend/.env` | not-started |
| Station → Place leg routes as car | Backend only does PTV for `station→station` pairs | Update pairwise check in `route.ts` | post-beta |

---

## Code Quality Checklist
- [ ] TypeScript: no `any` types
- [ ] Error handling: try-catch or .catch() where applicable
- [ ] No unused imports or variables
- [ ] Function parameters fully typed
- [ ] Exported types match backend contracts
- [ ] Edge cases documented in chat

---

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Mobile frontend | React Native (Expo) |
| Map rendering | Leaflet + OpenStreetMap (WebView) |
| Backend | Node.js + Express + TypeScript |
| Car routing | OSRM (public demo server) |
| Transit routing | GTFS Schedule + custom Raptor |
| Geocoding | Nominatim (OpenStreetMap) |
| Transit data | Victorian GTFS feeds (data.vic.gov.au) |
