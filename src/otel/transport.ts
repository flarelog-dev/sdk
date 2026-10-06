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

/**
 * Thrown by a transport when a failure cannot be fixed by sending the same
 * batch again — a rejected API key, an exhausted quota, a batch the server
 * refuses on size. Batch processors drop such a batch (and report it through
 * `onDrop`) instead of putting it back in the queue, where it would be retried
 * on every flush for as long as the process lives.
 */
export class PermanentExportError extends Error {
  readonly permanent = true;

  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PermanentExportError";
  }
}

export function isPermanentExportError(err: unknown): err is PermanentExportError {
  return typeof err === "object" && err !== null && (err as { permanent?: unknown }).permanent === true;
}
