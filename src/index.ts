// Core client
export { FlareLog, FlareLogChild } from "./client";

// Types
export type {
  FlareLogConfig,
  LogEntry,
  LogLevel,
  IngestResult,
  QueuedLog,
  CaptureOptions,
  RequestContext,
} from "./types";

// Utilities
export { shouldLog, getLevelValue } from "./levels";
export { LogBatch } from "./batch";
export { serializeError, getRootCause, isErrorLike } from "./errors";
