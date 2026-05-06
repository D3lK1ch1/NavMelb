// Severity levels for event routing to log files.

export type Severity = "catastrophic" | "high" | "info";

/**
 * Classify an event's severity based on its type string.
 * Used by file sinks to route events to the correct log file.
 *
 * - catastrophic: system cannot function (missing credentials, missing data)
 * - high: request-level failure (errors, not-found, partial failures)
 * - info: normal operation (success events, calculations)
 */
export function classifySeverity(eventType: string): Severity {
  // Catastrophic — system cannot function
  if (eventType.startsWith("infra.credentials") || eventType.startsWith("infra.missing")) {
    return "catastrophic";
  }

  // High — request-level failures
  if (
    eventType.endsWith(".error") ||
    eventType.endsWith(".failed") ||
    eventType.endsWith(".not_found") ||
    eventType.includes("partial_failure")
  ) {
    return "high";
  }

  // Everything else is informational
  return "info";
}
