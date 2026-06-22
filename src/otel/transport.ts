import type { ReadableSpan } from "./types";
import type { ReadableLogRecord } from "./types";

/**
 * A Transport is responsible for delivering telemetry to a backend.
 *
 * The SDK fans out log records and spans to all configured transports.
 * Each transport owns its own batching, retries, and HTTP delivery.
 *
 * Implementations:
 * - ConsoleTransport: pretty-prints to console (dev mode)
 * - OTLPTransport: ships OTLP/HTTP JSON to any OTel backend
 * - FlarelogTransport: ships to flarelog.dev (proprietary, optional via apiKey)
 */
export interface Transport {
  /** Human-readable name for debug logging. */
  readonly name: string;

  /** Called by the LogRecordProcessor when a log record is emitted. */
  exportLogs(logs: ReadableLogRecord[]): Promise<void>;

  /** Called by the SpanProcessor when a span ends. */
  exportSpans(spans: ReadableSpan[]): Promise<void>;

  /** Force-flush any in-flight batches. Called on ctx.waitUntil(). */
  flush(): Promise<void>;

  /** Release resources (timers, connections). */
  shutdown(): Promise<void>;
}

/**
 * Selectively enables logs and/or traces for a transport.
 * Some transports (e.g. Flarelog free tier) may only accept logs.
 */
export interface TransportCapabilities {
  logs: boolean;
  traces: boolean;
}
