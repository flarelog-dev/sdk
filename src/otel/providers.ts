import { diag, DiagConsoleLogger, DiagLogLevel, context, propagation } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator, CompositePropagator, W3CBaggagePropagator } from "@opentelemetry/core";
import { BasicTracerProvider, BatchSpanProcessor, SimpleSpanProcessor, ConsoleSpanExporter, type SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { LoggerProvider, BatchLogRecordProcessor, SimpleLogRecordProcessor, ConsoleLogRecordExporter, type LogRecordProcessor } from "@opentelemetry/sdk-logs";
import type { Resource } from "@opentelemetry/resources";
import type { Transport } from "./transport";

let contextManagerInstalled = false;

/**
 * Install the global context manager and propagator (once per process).
 *
 * This is required for log-to-trace correlation: when a log is emitted inside
 * a span's `context.with()` callback, the LogRecord picks up the active span's
 * traceId + spanId from the context manager.
 *
 * We use AsyncLocalStorageContextManager which works in Node.js, Bun, Deno,
 * and Cloudflare Workers (with nodejs_compat enabled). For runtimes without
 * AsyncLocalStorage, context propagation degrades gracefully (logs still work,
 * they just don't carry traceId/spanId unless explicitly set).
 */
function ensureContextManagerInstalled(): void {
  if (contextManagerInstalled) return;
  try {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager());
    propagation.setGlobalPropagator(
      new CompositePropagator({
        propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
      })
    );
    contextManagerInstalled = true;
  } catch (err) {
    diag.warn("Failed to install context manager — log-to-trace correlation may not work", err);
  }
}

export interface ProviderOptions {
  resource: Resource;
  transports: Transport[];
  /** Enable OTel SDK diagnostic logging. Default false. */
  debug?: boolean;
  /**
   * Worker mode: use SimpleSpanProcessor / SimpleLogRecordProcessor (no batching,
   * flush on every span end). Required for Cloudflare Workers, where the runtime
   * may not live long enough for batch processors to flush.
   * Default: auto-detect.
   */
  workerMode?: boolean;
  /** Max batch size before flushing. Default 100. */
  maxQueueSize?: number;
  /** Max interval between flushes (ms). Default 5000 (Node), 0 (Worker). */
  scheduledDelayMillis?: number;
}

/**
 * Set up a TracerProvider and LoggerProvider for this FlareLog instance.
 *
 * Each FlareLog owns its own providers (not the OTel globals). This lets
 * multiple FlareLog instances coexist in the same process — important for
 * tests and for apps that want isolated telemetry configs.
 *
 * To integrate with other OTel libraries that use the global API, call
 * `tracerProvider.register()` yourself after construction. By default we
 * don't touch the globals.
 */
export function initProviders(opts: ProviderOptions): {
  tracerProvider: BasicTracerProvider;
  loggerProvider: LoggerProvider;
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
} {
  ensureContextManagerInstalled();

  if (opts.debug) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const isWorker = opts.workerMode ?? false;

  // --- TracerProvider ---
  const spanProcessors: SpanProcessor[] = [];

  for (const transport of opts.transports) {
    if (isWorker) {
      spanProcessors.push(
        new SimpleSpanProcessor(new TransportSpanExporter(transport))
      );
    } else {
      spanProcessors.push(
        new BatchSpanProcessor(new TransportSpanExporter(transport), {
          maxQueueSize: opts.maxQueueSize ?? 100,
          scheduledDelayMillis: opts.scheduledDelayMillis ?? 5000,
          maxExportBatchSize: 50,
        })
      );
    }
  }

  if (opts.debug) {
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  const tracerProvider = new BasicTracerProvider({
    resource: opts.resource,
    spanProcessors,
  });

  // --- LoggerProvider ---
  const logProcessors: LogRecordProcessor[] = [];

  for (const transport of opts.transports) {
    if (isWorker) {
      logProcessors.push(
        new SimpleLogRecordProcessor(new TransportLogExporter(transport))
      );
    } else {
      logProcessors.push(
        new BatchLogRecordProcessor(new TransportLogExporter(transport), {
          maxQueueSize: opts.maxQueueSize ?? 100,
          scheduledDelayMillis: opts.scheduledDelayMillis ?? 5000,
          maxExportBatchSize: 50,
        })
      );
    }
  }

  if (opts.debug) {
    logProcessors.push(new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()));
  }

  const loggerProvider = new LoggerProvider({
    resource: opts.resource,
    processors: logProcessors,
  });

  const flush = async () => {
    await Promise.all([
      tracerProvider.forceFlush(),
      loggerProvider.forceFlush(),
    ]);
    for (const transport of opts.transports) {
      await transport.flush();
    }
  };

  const shutdown = async () => {
    await flush();
    await Promise.all([
      tracerProvider.shutdown(),
      loggerProvider.shutdown(),
    ]);
    for (const transport of opts.transports) {
      await transport.shutdown();
    }
  };

  return { tracerProvider, loggerProvider, flush, shutdown };
}

// ---------------------------------------------------------------------------
// Adapters: wrap a Transport as an OTel SpanExporter / LogRecordExporter.
// ---------------------------------------------------------------------------

import type { SpanExporter, ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type { ExportResult } from "@opentelemetry/core";
import type { LogRecordExporter, ReadableLogRecord } from "@opentelemetry/sdk-logs";

class TransportSpanExporter implements SpanExporter {
  constructor(private transport: Transport) {}

  export(spans: ReadableSpan[], result: (r: ExportResult) => void): void {
    this.transport.exportSpans(spans).then(
      () => result({ code: 0 }), // ExportResultCode.SUCCESS
      (err) => result({ code: 1, error: err }) // ExportResultCode.FAILED
    );
  }

  async shutdown(): Promise<void> {
    await this.transport.shutdown();
  }

  async forceFlush(): Promise<void> {
    await this.transport.flush();
  }
}

class TransportLogExporter implements LogRecordExporter {
  constructor(private transport: Transport) {}

  export(logs: ReadableLogRecord[], result: (r: ExportResult) => void): void {
    this.transport.exportLogs(logs).then(
      () => result({ code: 0 }),
      (err) => result({ code: 1, error: err })
    );
  }

  async shutdown(): Promise<void> {
    await this.transport.shutdown();
  }

  async forceFlush(): Promise<void> {
    await this.transport.flush();
  }
}
