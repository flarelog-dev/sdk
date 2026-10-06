import type { Resource, ReadableSpan, ReadableLogRecord, TracerProvider, LoggerProvider, Logger, SpanExporter, LogRecordExporter, InstrumentationScope } from "./types";
import { ensureContextManager, getSpanContext } from "./context";
import { activeContext } from "./context";
import { SimpleTracerProvider } from "./span";
import { isPermanentExportError, type Transport } from "./transport";
import { runWithHookSkipped } from "../console";

export interface ProviderOptions {
  resource: Resource;
  transports: Transport[];
  debug?: boolean;
  workerMode?: boolean;
  maxQueueSize?: number;
  scheduledDelayMillis?: number;
  /** Invoked when records are dropped after repeated export failures. */
  onDrop?: (droppedCount: number) => void;
}

class TransportSpanExporter implements SpanExporter {
  constructor(private transport: Transport) {}
  async export(spans: ReadableSpan[]): Promise<void> { await this.transport.exportSpans(spans); }
  async forceFlush(): Promise<void> { await this.transport.flush(); }
  async shutdown(): Promise<void> { await this.transport.shutdown(); }
}

class TransportLogExporter implements LogRecordExporter {
  constructor(private transport: Transport) {}
  async export(logs: ReadableLogRecord[]): Promise<void> { await this.transport.exportLogs(logs); }
  async forceFlush(): Promise<void> { await this.transport.flush(); }
  async shutdown(): Promise<void> { await this.transport.shutdown(); }
}

class SimpleSpanProcessor {
  private exporter: TransportSpanExporter;
  private inFlight: Promise<void>[] = [];
  constructor(transport: Transport) {
    this.exporter = new TransportSpanExporter(transport);
  }
  async onEnd(span: ReadableSpan): Promise<void> {
    const promise = this.exporter.export([span]);
    this.inFlight.push(promise);
    promise.finally(() => {
      const idx = this.inFlight.indexOf(promise);
      if (idx !== -1) this.inFlight.splice(idx, 1);
    });
    await promise;
  }
  async forceFlush(): Promise<void> { 
    await Promise.allSettled(this.inFlight);
    await this.exporter.forceFlush(); 
  }
  async shutdown(): Promise<void> { await this.exporter.shutdown(); }
}

class BatchSpanProcessor {
  private queue: ReadableSpan[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private readonly maxQueueSize: number;
  private readonly scheduledDelayMillis: number;
  private readonly onDrop: (droppedCount: number) => void;
  private flushScheduled = false;
  private exporter: TransportSpanExporter;
  private retryCount: number = 0;
  private readonly maxRetries: number = 3;
  private flushPromise: Promise<void> = Promise.resolve();

  constructor(transport: Transport, opts: { maxQueueSize: number; scheduledDelayMillis: number; debug?: boolean; onDrop?: (n: number) => void }) {
    this.maxQueueSize = opts.maxQueueSize;
    this.scheduledDelayMillis = opts.scheduledDelayMillis;
    this.onDrop = opts.onDrop ?? (() => {});
    this.exporter = new TransportSpanExporter(transport);
    if (this.scheduledDelayMillis > 0) {
      this.timer = setInterval(() => { this.flush().catch((err) => this.logError("BatchSpanProcessor timer flush failed", err)); }, this.scheduledDelayMillis);
    }
  }

  private logError(message: string, err: unknown): void {
    // Always log errors, not just in debug mode - critical for visibility
    runWithHookSkipped(() => {
      // eslint-disable-next-line no-console
      console.error(`[FlareLog] ${message}:`, err);
    });
  }

  async onEnd(span: ReadableSpan): Promise<void> {
    this.queue.push(span);
    if (this.queue.length >= this.maxQueueSize) {
      this.scheduleFlush("BatchSpanProcessor flush failed");
    }
  }

  /**
   * Request a flush without awaiting it.
   *
   * Coalesced on purpose: without this guard, a full queue enqueues one flush
   * per emit, and every one of them chains onto flushPromise. Against a
   * backend that is down, that serial chain grows without bound and starves
   * every later flush. At most one flush is in flight at a time, with at most
   * one follow-up queued behind it.
   */
  private scheduleFlush(reason: string): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    this.flush()
      .catch((err) => this.logError(reason, err))
      .finally(() => {
        this.flushScheduled = false;
        // Records may have arrived while this flush was in flight.
        if (this.queue.length >= this.maxQueueSize) this.scheduleFlush(reason);
      });
  }

  async flush(): Promise<void> {
    // Chain flushes to prevent parallel requests but allow sequential processing
    this.flushPromise = this.flushPromise.then(async () => {
      if (this.queue.length === 0) return;
      
      // Only flush up to maxQueueSize items at a time to maintain batch size
      const batch = this.queue.splice(0, this.maxQueueSize);
      
      try {
        await this.exporter.export(batch);
        this.retryCount = 0; // Reset on success
      } catch (err) {
        // The backend refused this batch for good (bad key, quota, too large).
        // Re-queueing it would just replay the same refusal on every flush.
        if (isPermanentExportError(err)) {
          this.retryCount = 0;
          this.onDrop(batch.length);
          return;
        }

        // Put failed batch back at the front of the queue
        this.queue.unshift(...batch);
        this.retryCount++;

        // No in-band sleep here on purpose. Sleeping inside the flushPromise
        // chain blocks every subsequent flush for the backoff duration, so a
        // down backend would stall the whole pipeline instead of just failing
        // one batch. The re-queued batch is retried on the next flush — the
        // scheduled timer already supplies the spacing.
        if (this.retryCount < this.maxRetries) {
          this.logError(`Span export failed, batch re-queued for retry (attempt ${this.retryCount}/${this.maxRetries})`, err);
        } else {
          this.logError(`Span export failed after ${this.retryCount} attempts, ${batch.length} spans returned to queue`, err);
          // Reset so a recovered backend gets a fresh retry budget.
          this.retryCount = 0;
        }

        // If queue exceeds max size, drop oldest items (from the end)
        if (this.queue.length > this.maxQueueSize) {
          const dropped = this.queue.length - this.maxQueueSize;
          this.queue = this.queue.slice(0, this.maxQueueSize);
          this.logError(`Dropped ${dropped} spans due to buffer overflow`, err);
          this.onDrop(dropped);
        }
      }
    });

    return this.flushPromise;
  }

  async forceFlush(): Promise<void> { await this.flush(); await this.exporter.forceFlush(); }
  async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
    await this.exporter.shutdown();
  }
}

class SimpleLogProcessor {
  private exporter: TransportLogExporter;
  private inFlight: Promise<void>[] = [];
  constructor(transport: Transport) {
    this.exporter = new TransportLogExporter(transport);
  }
  async onEmit(log: ReadableLogRecord): Promise<void> {
    const promise = this.exporter.export([log]);
    this.inFlight.push(promise);
    promise.finally(() => {
      const idx = this.inFlight.indexOf(promise);
      if (idx !== -1) this.inFlight.splice(idx, 1);
    });
    await promise;
  }
  async forceFlush(): Promise<void> { 
    await Promise.allSettled(this.inFlight);
    await this.exporter.forceFlush(); 
  }
  async shutdown(): Promise<void> { await this.exporter.shutdown(); }
}

class BatchLogProcessor {
  private queue: ReadableLogRecord[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private readonly maxQueueSize: number;
  private readonly scheduledDelayMillis: number;
  private readonly onDrop: (droppedCount: number) => void;
  private flushScheduled = false;
  private exporter: TransportLogExporter;
  private retryCount: number = 0;
  private readonly maxRetries: number = 3;
  private flushPromise: Promise<void> = Promise.resolve();

  constructor(transport: Transport, opts: { maxQueueSize: number; scheduledDelayMillis: number; debug?: boolean; onDrop?: (n: number) => void }) {
    this.maxQueueSize = opts.maxQueueSize;
    this.scheduledDelayMillis = opts.scheduledDelayMillis;
    this.onDrop = opts.onDrop ?? (() => {});
    this.exporter = new TransportLogExporter(transport);
    if (this.scheduledDelayMillis > 0) {
      this.timer = setInterval(() => { this.flush().catch((err) => this.logError("BatchLogProcessor timer flush failed", err)); }, this.scheduledDelayMillis);
    }
  }

  private logError(message: string, err: unknown): void {
    // Always log errors, not just in debug mode - critical for visibility
    runWithHookSkipped(() => {
      // eslint-disable-next-line no-console
      console.error(`[FlareLog] ${message}:`, err);
    });
  }

  async onEmit(log: ReadableLogRecord): Promise<void> {
    this.queue.push(log);
    if (this.queue.length >= this.maxQueueSize) {
      this.scheduleFlush("BatchLogProcessor flush failed");
    }
  }

  /** See BatchSpanProcessor.scheduleFlush() for why this is coalesced. */
  private scheduleFlush(reason: string): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    this.flush()
      .catch((err) => this.logError(reason, err))
      .finally(() => {
        this.flushScheduled = false;
        if (this.queue.length >= this.maxQueueSize) this.scheduleFlush(reason);
      });
  }

  async flush(): Promise<void> {
    // Chain flushes to prevent parallel requests but allow sequential processing
    this.flushPromise = this.flushPromise.then(async () => {
      if (this.queue.length === 0) return;
      
      // Only flush up to maxQueueSize items at a time to maintain batch size
      const batch = this.queue.splice(0, this.maxQueueSize);
      
      try {
        await this.exporter.export(batch);
        this.retryCount = 0; // Reset on success
      } catch (err) {
        // See BatchSpanProcessor.flush(): a permanent refusal is dropped, not replayed.
        if (isPermanentExportError(err)) {
          this.retryCount = 0;
          this.onDrop(batch.length);
          return;
        }

        // Put failed batch back at the front of the queue
        this.queue.unshift(...batch);
        this.retryCount++;

        // See BatchSpanProcessor.flush(): no in-band sleep, so a down backend
        // can't stall the flushPromise chain for every other batch.
        if (this.retryCount < this.maxRetries) {
          this.logError(`Log export failed, batch re-queued for retry (attempt ${this.retryCount}/${this.maxRetries})`, err);
        } else {
          this.logError(`Log export failed after ${this.retryCount} attempts, ${batch.length} logs returned to queue`, err);
          this.retryCount = 0;
        }

        // If queue exceeds max size, drop oldest items (from the end)
        if (this.queue.length > this.maxQueueSize) {
          const dropped = this.queue.length - this.maxQueueSize;
          this.queue = this.queue.slice(0, this.maxQueueSize);
          this.logError(`Dropped ${dropped} logs due to buffer overflow`, err);
          this.onDrop(dropped);
        }
      }
    });

    return this.flushPromise;
  }

  async forceFlush(): Promise<void> { await this.flush(); await this.exporter.forceFlush(); }
  async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
    await this.exporter.shutdown();
  }
}

class FlareLogLoggerProvider implements LoggerProvider {
  private resource: Resource;
  private scope: InstrumentationScope;
  private processors: Array<SimpleLogProcessor | BatchLogProcessor>;

  constructor(resource: Resource, scope: InstrumentationScope, processors: Array<SimpleLogProcessor | BatchLogProcessor>) {
    this.resource = resource;
    this.scope = scope;
    this.processors = processors;
  }

  getLogger(name: string, version?: string): Logger {
    const scope = { name, version: version ?? this.scope.version };
    return {
      emit: (record) => {
        const now = Date.now();
        const hrTime: [number, number] = [Math.floor(now / 1000), (now % 1000) * 1_000_000];
        const spanCtx = record.context ? getSpanContext(record.context) : getSpanContext(activeContext());
        const logRecord: ReadableLogRecord = {
          hrTime,
          hrTimeObserved: hrTime,
          severityNumber: record.severityNumber,
          severityText: record.severityText,
          body: record.body,
          attributes: (record.attributes as Record<string, unknown>) ?? {},
          instrumentationScope: scope,
          resource: this.resource,
          spanContext: spanCtx,
        };
        for (const p of this.processors) {
          p.onEmit(logRecord).catch((err) => {
            // Always log processor errors, not just in debug mode
            runWithHookSkipped(() => {
              // eslint-disable-next-line no-console
              console.error("[FlareLog] Log processor error:", err);
            });
          });
        }
      },
    };
  }

  async forceFlush(): Promise<void> {
    await Promise.all(this.processors.map((p) => p.forceFlush()));
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.processors.map((p) => p.shutdown()));
  }
}

export function initProviders(opts: ProviderOptions): {
  tracerProvider: TracerProvider;
  loggerProvider: LoggerProvider;
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
} {
  ensureContextManager();

  const isWorker = opts.workerMode ?? false;
  const scope: InstrumentationScope = { name: "flarelog", version: "2.0.0" };

  const spanProcessors: Array<SimpleSpanProcessor | BatchSpanProcessor> = [];
  const logProcessors: Array<SimpleLogProcessor | BatchLogProcessor> = [];

  for (const transport of opts.transports) {
    // Use batching for both workers and non-workers
    // Workers: small batch size, no timer (flush at request end)
    // Non-workers: larger batch size, timer-based flush
    const maxQueueSize = isWorker ? 10 : (opts.maxQueueSize ?? 100);
    const scheduledDelayMillis = isWorker ? 0 : (opts.scheduledDelayMillis ?? 5000);
    
    spanProcessors.push(new BatchSpanProcessor(transport, {
      maxQueueSize,
      scheduledDelayMillis,
      onDrop: opts.onDrop,
    }));
    logProcessors.push(new BatchLogProcessor(transport, {
      maxQueueSize,
      scheduledDelayMillis,
      onDrop: opts.onDrop,
    }));
  }

  const onSpanEnd = (span: ReadableSpan) => {
    for (const p of spanProcessors) {
      p.onEnd(span).catch((err) => {
        if (opts.debug) {
          runWithHookSkipped(() => {
            // eslint-disable-next-line no-console
            console.error("[FlareLog] Span processor error:", err);
          });
        }
      });
    }
  };

  const tracerProvider = new SimpleTracerProvider(opts.resource, onSpanEnd);
  const loggerProvider = new FlareLogLoggerProvider(opts.resource, scope, logProcessors);

  // Transports reject on export failure so the batch processors can re-queue.
  // Flush and shutdown must therefore settle everything rather than bail on the
  // first rejection — one unreachable backend must not abandon the others.
  const settleAll = async (label: string, tasks: Array<Promise<unknown>>): Promise<void> => {
    const results = await Promise.allSettled(tasks);
    for (const r of results) {
      if (r.status === "rejected") {
        runWithHookSkipped(() => {
          // eslint-disable-next-line no-console
          console.error(`[FlareLog] ${label} failed:`, r.reason);
        });
      }
    }
  };

  const flush = async () => {
    await settleAll("Processor flush", [
      ...spanProcessors.map((p) => p.forceFlush()),
      ...logProcessors.map((p) => p.forceFlush()),
    ]);
    await settleAll("Transport flush", opts.transports.map((t) => t.flush()));
  };

  const shutdown = async () => {
    await flush();
    await settleAll("Processor shutdown", [
      ...spanProcessors.map((p) => p.shutdown()),
      ...logProcessors.map((p) => p.shutdown()),
    ]);
    await settleAll("Transport shutdown", opts.transports.map((t) => t.shutdown()));
  };

  return { tracerProvider, loggerProvider, flush, shutdown };
}
