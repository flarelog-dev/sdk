/**
 * Log severity levels following OpenTelemetry conventions
 */
export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

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
 * Configuration options for the FlareLog client
 */
export interface FlareLogConfig {
  /** Your FlareLog API key */
  apiKey: string;
  /** Project slug to send logs to */
  project: string;
  /** FlareLog API endpoint. Defaults to https://flarelog.dev/api */
  endpoint?: string;
  /** Minimum log level to send. Defaults to "DEBUG" */
  level?: LogLevel;
  /** Number of logs to batch before sending. Defaults to 10 */
  batchSize?: number;
  /** Flush interval in milliseconds. Defaults to 5000 */
  flushIntervalMs?: number;
  /** Whether to enable debug logging. Defaults to false */
  debug?: boolean;
  /** Default source tag for all logs */
  defaultSource?: string;
  /** Whether to include timestamps automatically. Defaults to true */
  includeTimestamps?: boolean;
}

/**
 * Result of a log ingestion operation
 */
export interface IngestResult {
  success: boolean;
  ingested: number;
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
