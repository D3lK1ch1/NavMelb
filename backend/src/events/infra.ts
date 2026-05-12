// Infrastructure error classifier.
// Distinguishes between recoverable external-service failures and genuine bugs.

export type InfraErrorKind =
  | "network_timeout"
  | "network_unreachable"
  | "credentials_missing"
  | "not_found"
  | "rate_limited"
  | "upstream_error"
  | "unknown";

export interface ClassifiedError {
  kind: InfraErrorKind;
  retryable: boolean;
  message: string;
}

/**
 * Classify an unknown error thrown by an infrastructure call (HTTP, file I/O, etc.)
 * into a structured kind that business logic can reason about.
 */
export function classifyInfraError(error: unknown): ClassifiedError {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    if (msg.includes("timeout") || msg.includes("econnreset") || msg.includes("etimedout")) {
      return { kind: "network_timeout", retryable: true, message: error.message };
    }
    if (msg.includes("econnrefused") || msg.includes("enotfound") || msg.includes("network")) {
      return { kind: "network_unreachable", retryable: true, message: error.message };
    }
    if (msg.includes("credentials") || msg.includes("api key") || msg.includes("not configured")) {
      return { kind: "credentials_missing", retryable: false, message: error.message };
    }
    if (msg.includes("404") || msg.includes("not found")) {
      return { kind: "not_found", retryable: false, message: error.message };
    }
    if (msg.includes("429") || msg.includes("rate limit")) {
      return { kind: "rate_limited", retryable: true, message: error.message };
    }
    if (msg.includes("500") || msg.includes("502") || msg.includes("503")) {
      return { kind: "upstream_error", retryable: true, message: error.message };
    }
    return { kind: "unknown", retryable: false, message: error.message };
  }

  return { kind: "unknown", retryable: false, message: String(error) };
}
