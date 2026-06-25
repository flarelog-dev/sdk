// Core client
export { FlareLog, FlareLogChild } from "./client";

// Branded factory function
export { flarelog } from "./factory";

// Framework helpers
export { workerFetch, pagesFunction } from "./frameworks/cf-workers";
export {
  withVercelServerless,
  withVercelEdge,
  detectVercelEnv,
} from "./frameworks/vercel";
export type {
  VercelServerlessHandler,
  VercelEdgeHandler,
} from "./frameworks/vercel";

// OTel-native exports
export { ConsoleTransport } from "./otel/console-transport";
export { OTLPTransport } from "./otel/otlp-transport";
export { FlarelogTransport } from "./otel/flarelog-transport";
export type { Transport, TransportCapabilities } from "./otel/transport";
export { buildResource } from "./otel/resource";
export { initProviders } from "./otel/providers";
export {
  extractContext,
  injectContext,
  getActiveSpanContext,
  withActiveSpan,
  ensurePropagatorInstalled,
} from "./otel/propagation";
export {
  detectOtelEnv,
  detectFlarelogEnv,
  detectRuntime,
  detectServiceName,
} from "./otel/env";

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
  TransportConfig,
  UserContext,
  Breadcrumb,
  PagesFunctionHandler,
  PagesFunctionContext,
} from "./types";

// Utilities
export { shouldLog, getLevelValue } from "./levels";
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
