import type { LogLevel } from "./types";

/** Numeric severity values (OpenTelemetry standard) */
const LEVEL_VALUES: Record<LogLevel, number> = {
  TRACE: 1,
  DEBUG: 5,
  INFO: 9,
  WARN: 13,
  ERROR: 17,
  FATAL: 21,
};

/**
 * Check if a log level should be emitted based on the configured minimum level
 */
export function shouldLog(level: LogLevel, minimumLevel: LogLevel): boolean {
  return LEVEL_VALUES[level] >= LEVEL_VALUES[minimumLevel];
}

/**
 * Get the numeric severity value for a level
 */
export function getLevelValue(level: LogLevel): number {
  return LEVEL_VALUES[level];
}
