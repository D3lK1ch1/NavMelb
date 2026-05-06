# Command/Strategy Pattern Refactor — Audit Report

## What Was Refactored

The `POST /route/calculate` handler in `backend/src/routes/route.ts` was a God Handler doing seven distinct things in one function:

1. Input validation (origin/destination coordinates, strategy)
2. Departure time normalisation ("HH:MM" → "HH:MM:SS" or default to now)
3. Car routing: calling `osrmRoute` and assembling a segment
4. PTV routing: station filtering, building the point chain, iterating legs, time arithmetic
5. Departure info fetching: calling `ptvFindStopByName` + `ptvGetDepartures` for each station waypoint
6. Partial-failure detection (any `type === "failed"` segment → 207)
7. Response shaping into `RouteResult`

The strategy selection was declared as a type (`RouteStrategy = "car" | "ptv"`) but resolved with a plain `if/else` block, not a dispatch table. The handler also bypassed the facade in `route-map.service.ts` to reach directly into PTV internals for departure info (Feature Envy).

## File Structure

### Before

```
backend/src/
  routes/
    route.ts          (~165 lines; POST /route/calculate = ~100 lines of mixed logic)
  services/
    route-map.service.ts
    ptv-api.service.ts
    ...
  types/
    index.ts
```

### After

```
backend/src/
  routes/
    route.ts          (~55 lines for /route/calculate handler; ~200 total including other routes)
  strategies/
    types.ts          (RouteCommand, RouteStrategyResult, IRouteStrategy interfaces)
    car.strategy.ts   (CarStrategy: wraps osrmRoute, returns one car segment)
    ptv.strategy.ts   (PtvStrategy: station filtering, leg loop, time arithmetic, car fill-in legs)
  services/
    route-map.service.ts   (unchanged)
    ptv-api.service.ts     (unchanged)
    ...
  types/
    index.ts               (unchanged)
```

## Lines of Code: /route/calculate Handler

| Metric | Before | After |
|--------|--------|-------|
| Handler body (POST /route/calculate) | ~100 lines | ~40 lines |
| car routing logic | inline | `car.strategy.ts` (~20 lines) |
| PTV leg loop + time arithmetic | inline | `ptv.strategy.ts` (~65 lines) |
| departure info fetch | inline | `fetchDepartureInfo()` helper (~20 lines) |

## Key Design Decisions

### RouteCommand interface

```typescript
export interface RouteCommand {
  origin: Coordinate;
  destination: Coordinate;
  waypoints: Waypoint[];
  departureTime: string; // normalised HH:MM:SS
}
```

The handler normalises `departureTime` before building the command, so strategies never need to handle raw/missing departure times. Validation stays in the handler where it can return 400 responses directly.

### PtvValidationError

The PTV strategy needs to return a 400 when there are no station waypoints. Since strategies don't have access to the `Response` object, `PtvStrategy.execute()` throws a `PtvValidationError` which the handler catches and converts to a 400 response. This keeps HTTP concerns in the handler and domain logic in the strategy.

### Dispatch table

```typescript
const strategies: Record<RouteStrategy, IRouteStrategy> = {
  car: new CarStrategy(),
  ptv: new PtvStrategy(),
};
```

Strategy selection is now O(1) dictionary lookup instead of an if/else chain.

### fetchDepartureInfo helper

The Feature Envy code (reaching into `ptvFindStopByName` and `ptvGetDepartures`) was extracted to a module-level helper function `fetchDepartureInfo(waypoints)`. It remains in `route.ts` since it is route-layer glue — it converts waypoints to departure info for the response, not routing logic.

## How This Makes Future Changes Easier

### Adding a "cycling" strategy

Before: add another `else if (strategy === "cycling")` branch inside the 100-line handler, adding ~20 more lines of inline logic.

After:
1. Add `"cycling"` to the `RouteStrategy` type
2. Create `backend/src/strategies/cycling.strategy.ts` implementing `IRouteStrategy`
3. Add one entry to the dispatch table: `cycling: new CyclingStrategy()`

The handler needs zero changes. TypeScript will flag the missing key in the `Record<RouteStrategy, IRouteStrategy>` dispatch table if you forget to add it.

### Changing PTV leg logic

The time advancement arithmetic and PTV leg loop are now isolated in `ptv.strategy.ts`. Changes don't risk touching car routing logic or departure info fetching.

### Testing strategies in isolation

Strategies are plain classes. You can unit-test `CarStrategy.execute()` or `PtvStrategy.execute()` directly, without spinning up an Express app. The acceptance tests continue to test the full handler through the HTTP layer.
