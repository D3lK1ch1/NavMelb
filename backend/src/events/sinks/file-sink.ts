import { appendFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import type { EventSink } from "../dispatch";
import { classifySeverity, Severity } from "../classify-severity";

// Resolve log directory relative to project root
const LOG_DIR = path.resolve(process.cwd(), "logs");

// Map severity to log file (info events don't get a file)
const SEVERITY_FILES: Partial<Record<Severity, string>> = {
  catastrophic: path.join(LOG_DIR, "catastrophic.log"),
  high: path.join(LOG_DIR, "errors.log"),
};

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function formatLine(event: { type: string }): string {
  return JSON.stringify({ ...event, _ts: new Date().toISOString() }) + "\n";
}

/**
 * Create a file sink that routes events by severity.
 * - catastrophic → logs/catastrophic.log
 * - high → logs/errors.log
 * - info → no file (handled by dev console sink)
 */
export function createFileSink(): EventSink {
  ensureLogDir();

  return (event) => {
    const severity = classifySeverity(event.type);
    const filePath = SEVERITY_FILES[severity];
    if (!filePath) return;

    try {
      appendFileSync(filePath, formatLine(event));
    } catch {
      process.stderr.write(`[sink:file] Failed to write ${severity} event: ${event.type}\n`);
    }
  };
}
