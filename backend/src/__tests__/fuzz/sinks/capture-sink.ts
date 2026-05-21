import type { NavEvent } from "../../../events/types";
import { registerSink, clearSinks } from "../../../events/dispatch";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const LOG_DIR = join(__dirname, "../logs");

export function createCaptureSink(testName: string) {
  const captured: NavEvent[] = [];
  const sink = (event: NavEvent) => {
    captured.push(event);
  };
  const flush = () => {
    mkdirSync(LOG_DIR, { recursive: true });
    const path = join(LOG_DIR, `${testName.replace(/\W+/g, "-")}-${Date.now()}.jsonl`);
    writeFileSync(path, captured.map((e) => JSON.stringify(e)).join("\n") + "\n");
    return path;
  };
  const clear = () => {
    captured.length = 0;
  };
  const register = () => {
    registerSink(sink);
  };
  return { sink, flush, clear, captured, register };
}

/** Register a capture sink, returning an object that can register and teardown cleanly. */
export function withCaptureSink(testName: string) {
  const captureSink = createCaptureSink(testName);
  captureSink.register();
  return {
    ...captureSink,
    teardown: () => {
      clearSinks();
    },
  };
}
