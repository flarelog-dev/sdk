import type { ConsoleCaptureOptions, ConsoleLevel, FlareLogLike, LogLevel } from "./types";
import { buildConsoleError, formatConsoleMessage, serializeConsoleArgs } from "./errors";
import { DedupTracker } from "./dedup";

const LEVEL_MAP: Record<ConsoleLevel, LogLevel> = {
  log: "INFO",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  debug: "DEBUG",
  trace: "TRACE",
};

let skipHook = false;

export function runWithHookSkipped<T>(fn: () => T): T {
  const previous = skipHook;
  skipHook = true;
  try {
    return fn();
  } finally {
    skipHook = previous;
  }
}

export interface InstallConsoleHooksOptions extends ConsoleCaptureOptions {
  dedupWindowMs?: number;
}

export function installConsoleHooks(
  logger: FlareLogLike,
  opts: InstallConsoleHooksOptions = {}
): () => void {
  const levels = opts.levels ?? ["error", "warn"];
  const source = opts.source ?? "console";
  const includeArgs = opts.includeArgs ?? true;
  const dedup = new DedupTracker({
    windowMs:
      typeof opts.dedupWindowMs === "number" ? opts.dedupWindowMs : 5000,
  });
  const cleanupFns: Array<() => void> = [];

  for (const level of levels) {
    const original = console[level] as (...args: unknown[]) => void;
    const logLevel = LEVEL_MAP[level];

    const wrapped = (...args: unknown[]): void => {
      if (skipHook) {
        original.apply(console, args);
        return;
      }

      const message = formatConsoleMessage(args);
      const key = `${source}:${level}:${message}`;
      const isDup = dedup.isDuplicate(key);

      if (!isDup) {
        const metadata: Record<string, unknown> = { consoleLevel: level };
        if (includeArgs) {
          metadata.args = serializeConsoleArgs(args);
        }
        logger.logError(buildConsoleError(args), {
          message,
          level: logLevel,
          source,
          metadata,
        });
      }

      original.apply(console, args);
    };

    (console as Record<ConsoleLevel, (...args: unknown[]) => void>)[level] = wrapped;

    cleanupFns.push(() => {
      (console as Record<ConsoleLevel, (...args: unknown[]) => void>)[level] = original;
    });
  }

  return () => {
    for (const cleanup of cleanupFns) {
      cleanup();
    }
  };
}
