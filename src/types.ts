/**
 * Log severity levels following OpenTelemetry conventions
 */
export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

/**
 * Console levels that can be intercepted by hooks
 */
export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug" | "trace";

/**
 * A single log entry
 */
export interface LogEntry {
  /** ISO 8601 timestamp. Defaults to current time if not provided. */
  timestamp?: string;
  /** Log severity level */
  level: LogLevel;
  /** Log message body */
  message: string;
  /** Source identifier (e.g., function name, route) */
  source?: string;
  /** Arbitrary structured metadata */
  metadata?: Record<string, unknown>;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Span ID for distributed tracing */
  spanId?: string;
}

/**
 * User context for identifying who experienced an error
 */
export interface UserContext {
  id?: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * Breadcrumb entry for tracking events leading to an error
 */
export interface Breadcrumb {
  timestamp: string;
  category: string;
  message: string;
  level?: LogLevel;
  data?: Record<string, unknown>;
}

/**
 * Resolved configuration with all defaults applied.
 * This is the concrete type used internally, not Required<FlareLogConfig>.
 */
export interface ResolvedConfig {
  apiKey: string;
  endpoint: string;
  allowInsecure: boolean;
  level: LogLevel;
  batchSize: number;
  flushIntervalMs: number;
  debug: boolean;
  defaultSource: string;
  includeTimestamps: boolean;
  autoCapture: AutoCaptureConfig;
  environment: string;
  release: string;
  serverName: string;
  beforeSend: (log: LogEntry) => LogEntry | false;
  scrubFields: string[];
  sampleRate: number;
  maxBatchSize: number;
  onDrop: (droppedCount: number) => void;
  workerMode: boolean;
}

/**
 * Configuration options for the FlareLog client
 */
export interface FlareLogConfig {
  /** Your FlareLog API key */
  apiKey: string;
  /** FlareLog API endpoint. Defaults to https://flarelog.dev/api */
  endpoint?: string;
  /** Allow insecure HTTP endpoints (not recommended). Defaults to false */
  allowInsecure?: boolean;
  /** Minimum log level to send. Defaults to "DEBUG" */
  level?: LogLevel;
  /** Number of logs to batch before sending. Defaults to 10 (Node), 1 (Worker) */
  batchSize?: number;
  /** Flush interval in milliseconds. Defaults to 5000 (Node), 0 (Worker) */
  flushIntervalMs?: number;
  /** Whether to enable debug logging. Defaults to false */
  debug?: boolean;
  /** Default source tag for all logs */
  defaultSource?: string;
  /** Whether to include timestamps automatically. Defaults to true */
  includeTimestamps?: boolean;
  /** Automatic error capture configuration */
  autoCapture?: AutoCaptureConfig;
  /** Environment name (e.g., "production", "staging", "development") */
  environment?: string;
  /** Release version (e.g., "1.2.3" or git commit SHA) */
  release?: string;
  /** Server hostname or instance identifier */
  serverName?: string;
  /** Callback to modify or drop logs before sending. Return false to drop. */
  beforeSend?: (log: LogEntry) => LogEntry | false;
  /** Fields to scrub from metadata (PII redaction). Defaults to common sensitive fields. */
  scrubFields?: string[];
  /** Sample rate for logs (0.0 to 1.0). Defaults to 1.0 (100%) */
  sampleRate?: number;
  /** Max in-flight buffer size. Defaults to 100 */
  maxBatchSize?: number;
  /** Callback invoked when logs are dropped due to buffer overflow. Receives the dropped log count. */
  onDrop?: (droppedCount: number) => void;
  /** Worker mode: auto-detects if not set. When true, flushes immediately with no timer. */
  workerMode?: boolean;
}

/**
 * Automatic error capture configuration
 */
export interface AutoCaptureConfig {
  /** Capture console.error / console.warn (and optionally more) */
  console?: boolean | ConsoleCaptureOptions;
  /** Capture global/runtime error events */
  globalErrors?: boolean;
  /** Capture unhandled promise rejections */
  rejections?: boolean;
  /** Enable worker fetch handler wrapper helpers */
  fetchHandler?: boolean;
  /** Enable Web Worker wrapper helpers */
  worker?: boolean;
  /** Deduplication window in milliseconds. Defaults to 5000 */
  dedupWindowMs?: number;
  /** Capture navigation breadcrumbs */
  navigation?: boolean;
  /** Capture fetch/XHR breadcrumbs and performance data */
  http?: boolean;
  /** Capture DOM click breadcrumbs */
  clicks?: boolean;
}

/**
 * Options for console hook capture
 */
export interface ConsoleCaptureOptions {
  /** Console methods to intercept. Defaults to ["error", "warn"] */
  levels?: ConsoleLevel[];
  /** Source tag for captured console logs. Defaults to "console" */
  source?: string;
  /** Include original console arguments in metadata. Defaults to true */
  includeArgs?: boolean;
}

/**
 * Result of a log ingestion operation
 */
export interface IngestResult {
  success: boolean;
  ingested: number;
  error?: string;
}

/**
 * Options for error capture methods
 */
export interface CaptureOptions {
  /** Override the source tag for this capture */
  source?: string;
  /** Additional metadata to attach to error logs */
  metadata?: Record<string, unknown>;
  /** Custom log level for captured errors. Defaults to "ERROR" */
  level?: "WARN" | "ERROR" | "FATAL";
  /** Whether to re-throw the error after logging. Defaults to true */
  rethrow?: boolean;
  /** A descriptive label for what operation was being attempted */
  label?: string;
}

/**
 * Logger interface used by internal capture modules.
 */
export interface FlareLogLike {
  trace(message: string, metadata?: Record<string, unknown>): void;
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
  fatal(message: string, metadata?: Record<string, unknown>): void;
  log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    opts?: { source?: string; traceId?: string; spanId?: string }
  ): void;
  logError(
    err: unknown,
    opts?: {
      message?: string;
      level?: LogLevel;
      source?: string;
      metadata?: Record<string, unknown>;
      traceId?: string;
    }
  ): void;
  addBreadcrumb(breadcrumb: Omit<Breadcrumb, "timestamp">): void;
  setUser(user: UserContext | null): void;
  setTag(key: string, value: string): void;
  flush(): Promise<void>;
  child(defaults: Record<string, unknown> & { source?: string }): FlareLogLike;
}

/**
 * Execution context shape used by Cloudflare Workers and similar runtimes.
 * waitUntil is optional to allow graceful degradation in test/custom environments.
 */
export interface ExecutionContextLike {
  waitUntil?(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

/**
 * Cloudflare Worker fetch handler signature
 */
export type WorkerFetchHandler<T = Response> = (
  request: Request,
  env: unknown,
  ctx: ExecutionContextLike
) => Promise<T>;

/**
 * Options for request-scoped logging (Cloudflare Workers)
 */
export interface RequestContext {
  /** The incoming Request object */
  request: Request;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Additional context metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Internal queued log with resolved timestamp
 */
export interface QueuedLog extends LogEntry {
  timestamp: string;
}
