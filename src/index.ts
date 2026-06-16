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
  ConsoleCaptureOptions,
  ConsoleLevel,
  AutoCaptureConfig,
  WorkerFetchHandler,
  ExecutionContextLike,
  FlareLogLike,
  RequestContext,
} from "./types";

// Utilities
export { shouldLog, getLevelValue } from "./levels";
export { LogBatch } from "./batch";
export {
  serializeError,
  getRootCause,
  isErrorLike,
  getErrorFingerprint,
  buildConsoleError,
  serializeConsoleArgs,
  formatConsoleMessage,
} from "./errors";
export { DedupTracker } from "./dedup";
export { installConsoleHooks, runWithHookSkipped } from "./console";
export { createWorkerFetchHandler, wrapWorker } from "./workers";
