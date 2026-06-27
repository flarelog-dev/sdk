/**
 * Log severity levels following OpenTelemetry conventions.
 * Numeric severity values: TRACE=1, DEBUG=5, INFO=9, WARN=13, ERROR=17, FATAL=21.
 */
export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

/**
 * Console levels that can be intercepted by hooks
 */
export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug" | "trace";

/**
 * A single log entry — backwards-compatible with v1, now with OTel-friendly
 * optional fields.
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
  /** Trace ID for distributed tracing (W3C, 32 hex chars) */
  traceId?: string;
  /** Span ID for distributed tracing (W3C, 16 hex chars) */
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
 * Configuration options for the FlareLog client (v2 — OTel-native).
 *
 * The biggest change from v1: `apiKey` is now OPTIONAL. With no API key and no
 * OTLP endpoint configured, the SDK defaults to console output. This makes the
 * SDK useful out-of-the-box with zero backend setup.
 */
export interface FlareLogConfig {
  /**
   * Flarelog API key (optional).
   *
   * When provided, enables the Flarelog hosted backend transport.
   * When omitted, the SDK still works — it just exports to console and/or
   * any OTLP endpoint you configure via `transports` or env vars.
   */
  apiKey?: string;

  /** Flarelog endpoint. Defaults to https://flarelog.dev */
  endpoint?: string;

  /** Allow insecure HTTP endpoints (not recommended). Defaults to false */
  allowInsecure?: boolean;

  /** Minimum log level to send. Defaults to "DEBUG" */
  level?: LogLevel;

  /** Number of logs to batch before sending. Defaults to 50 (Node), 1 (Worker) */
  batchSize?: number;

  /** Flush interval in milliseconds. Defaults to 5000 (Node), 0 (Worker) */
  flushIntervalMs?: number;

  /** Whether to enable debug logging (OTel diag logger + extra console output). Defaults to false */
  debug?: boolean;

  /**
   * Warn to `console.warn` when the SDK falls back to `ConsoleTransport`
   * because no backend is configured (i.e., `FLARELOG_API_KEY` and
   * `OTEL_EXPORTER_OTLP_ENDPOINT` are both unset AND no explicit `transports`
   * array was provided).
   *
   * This catches the most common deployment bug: the user set an API key in
   * their platform's dashboard (e.g. Cloudflare Workers, Lovable, Vercel) but
   * the SDK can't see it from `process.env` at module load, so it silently
   * falls back to console-only logging and nothing ships to the dashboard.
   *
   * - `true` (default): emit a one-time `console.warn` describing the fallback
   *   and how to fix it.
   * - `false`: suppress the warning (for users who intentionally want
   *   console-only logging).
   *
   * The warning is emitted at most once per `FlareLog` instance.
   */
  warnOnConsoleFallback?: boolean;

  /** Default source tag for all logs */
  defaultSource?: string;

  /** Whether to include timestamps automatically. Defaults to true */
  includeTimestamps?: boolean;

  /** Automatic error capture configuration */
  autoCapture?: AutoCaptureConfig;

  /** Environment name (e.g., "production", "staging", "development") — sets deployment.environment.name resource attr */
  environment?: string;

  /** Release version — sets service.version resource attr */
  release?: string;

  /** Server hostname — sets host.name resource attr */
  serverName?: string;

  /** Service name — sets service.name resource attr. Defaults to npm_package_name or "unknown_service" */
  serviceName?: string;

  /** Service namespace — sets service.namespace resource attr */
  serviceNamespace?: string;

  /** Extra resource attributes (in addition to OTEL_RESOURCE_ATTRIBUTES env var) */
  resourceAttributes?: Record<string, string>;

  /** Callback to modify or drop logs before sending. Return false to drop. */
  beforeSend?: (log: LogEntry) => LogEntry | false;

  /** Fields to scrub from metadata (PII redaction). Defaults to common sensitive fields. */
  scrubFields?: string[];

  /** Sample rate for logs (0.0 to 1.0). Defaults to 1.0 (100%) */
  sampleRate?: number;

  /** Max in-flight buffer size. Defaults to 100 */
  maxBatchSize?: number;

  /** Callback invoked when logs are dropped due to buffer overflow. */
  onDrop?: (droppedCount: number) => void;

  /** Worker mode: auto-detects if not set. When true, uses SimpleProcessor (flush on every event). */
  workerMode?: boolean;

  /**
   * Explicit list of transports. Overrides env-var-based auto-detection.
   * Use this when you want full control (e.g. fan-out to console + OTLP + Flarelog).
   */
  transports?: TransportConfig[];

  /**
   * OTLP/HTTP endpoint for any OTel backend (Grafana Cloud, Honeycomb, Tempo, etc.).
   * Shorthand for `transports: [{ type: "otlp", endpoint }]`.
   * Can also be set via OTEL_EXPORTER_OTLP_ENDPOINT env var.
   */
  otlpEndpoint?: string;

  /** Headers for the OTLP transport (e.g. Authorization). Shorthand for transports[0].headers. */
  otlpHeaders?: Record<string, string>;
}

/**
 * Transport configuration — used in the `transports` array.
 */
export type TransportConfig =
  | { type: "console" }
  | {
      type: "otlp";
      endpoint?: string;
      logsEndpoint?: string;
      tracesEndpoint?: string;
      headers?: Record<string, string>;
      enableLogs?: boolean;
      enableTraces?: boolean;
    }
  | {
      type: "flarelog";
      apiKey: string;
      endpoint?: string;
      enableTraces?: boolean;
    };

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
  /** Enable worker fetch handler wrapper helpers. Not currently used. */
  fetchHandler?: boolean;
  /** Enable Web Worker wrapper helpers. Not currently used. */
  worker?: boolean;
  /** Deduplication window in milliseconds. Defaults to 5000 */
  dedupWindowMs?: number;
  /** Capture navigation breadcrumbs. Not yet implemented. */
  navigation?: boolean;
  /** Capture fetch/XHR breadcrumbs and performance data. Not yet implemented. */
  http?: boolean;
  /** Capture DOM click breadcrumbs. Not yet implemented. */
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
 * Cloudflare Pages Function context shape (used in `functions/` directory).
 * This is the context object passed to `onRequest` handlers in Pages Functions.
 * Pages Functions run on the same Workers runtime but have a different API shape.
 */
export interface PagesFunctionContext {
  /** The incoming Request object */
  request: Request;
  /** Environment variables and bindings (KV, D1, R2, etc.) */
  env: Record<string, unknown>;
  /** Wait until a promise resolves before the function ends */
  waitUntil: (promise: Promise<unknown>) => void;
  /** Next function in the middleware chain (if using middleware) */
  next?: () => Promise<Response>;
  /** Data passed between middlewares */
  data?: Record<string, unknown>;
  /** Function parameters from dynamic routes */
  params?: Record<string, string>;
}

/**
 * Cloudflare Pages Function handler signature
 */
export type PagesFunctionHandler<T = Response> = (
  context: PagesFunctionContext
) => Promise<T>;

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
  /** Trace ID for distributed tracing (auto-extracted from W3C traceparent if omitted) */
  traceId?: string;
  /** Additional context metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Internal queued log with resolved timestamp (kept for backwards compat).
 */
export interface QueuedLog extends LogEntry {
  timestamp: string;
}
