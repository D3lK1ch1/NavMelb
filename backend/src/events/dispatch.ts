import { NavEvent } from "./types";

// A sink receives events and does something with them (log, metric, trace, etc.)
export type EventSink = (event: NavEvent) => void;

const sinks: EventSink[] = [];

/** Register a sink to receive all future events. */
export function registerSink(sink: EventSink): void {
  sinks.push(sink);
}

/** Remove all registered sinks. Useful for test teardown. */
export function clearSinks(): void {
  sinks.length = 0;
}

/** Dispatch an event to all registered sinks. Never throws. */
export function dispatch(event: NavEvent): void {
  for (const sink of sinks) {
    try {
      sink(event);
    } catch {
      // Sinks must not crash the application.
    }
  }
}
