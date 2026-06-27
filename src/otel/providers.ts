import type { Resource, ReadableSpan, ReadableLogRecord, TracerProvider, LoggerProvider, Logger, SpanExporter, LogRecordExporter, InstrumentationScope } from "./types";
import { ensureContextManager, getSpanContext } from "./context";
import { activeContext } from "./context";
import { SimpleTracerProvider } from "./span";
import type { Transport } from "./transport";
import { runWithHookSkipped } from "../console";

export interface ProviderOptions {
  resource: Resource;
  transports: Transport[];
  debug?: boolean;
  workerMode?: boolean;
  maxQueueSize?: number;
  scheduledDelayMillis?: number;
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
    await Promise.all(this.inFlight);
    await this.exporter.forceFlush(); 
  }
  async shutdown(): Promise<void> { await this.exporter.shutdown(); }
}

class BatchSpanProcessor {
  private queue: ReadableSpan[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private readonly maxQueueSize: number;
  private readonly scheduledDelayMillis: number;
  private exporter: TransportSpanExporter;
  private retryCount: number = 0;
  private readonly maxRetries: number = 3;
  private flushPromise: Promise<void> = Promise.resolve();

  constructor(transport: Transport, opts: { maxQueueSize: number; scheduledDelayMillis: number; debug?: boolean }) {
    this.maxQueueSize = opts.maxQueueSize;
    this.scheduledDelayMillis = opts.scheduledDelayMillis;
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
      // Flush immediately without awaiting to prevent blocking
      // but still allow the queue to be drained
      this.flush().catch((err) => this.logError("BatchSpanProcessor flush failed", err));
    }
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
        // Put failed batch back at the front of the queue
        this.queue.unshift(...batch);
        
        // Retry with exponential backoff
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          const delay = Math.min(1000 * Math.pow(2, this.retryCount - 1), 10000);
          this.logError(`Span export failed, retrying in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`, err);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          // Don't auto-retry here - let the next flush() call handle it
          // This prevents infinite loops and allows proper batching
        } else {
          this.logError(`Span export failed after ${this.maxRetries} retries, ${batch.length} spans returned to queue`, err);
          // Reset retry count so future batches can retry
          this.retryCount = 0;
        }
        
        // If queue exceeds max size, drop oldest items (from the end)
        if (this.queue.length > this.maxQueueSize) {
          const dropped = this.queue.length - this.maxQueueSize;
          this.queue = this.queue.slice(0, this.maxQueueSize);
          this.logError(`Dropped ${dropped} spans due to buffer overflow`, err);
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
    await Promise.all(this.inFlight);
    await this.exporter.forceFlush(); 
  }
  async shutdown(): Promise<void> { await this.exporter.shutdown(); }
}

class BatchLogProcessor {
  private queue: ReadableLogRecord[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private readonly maxQueueSize: number;
  private readonly scheduledDelayMillis: number;
  private exporter: TransportLogExporter;
  private retryCount: number = 0;
  private readonly maxRetries: number = 3;
  private flushPromise: Promise<void> = Promise.resolve();

  constructor(transport: Transport, opts: { maxQueueSize: number; scheduledDelayMillis: number; debug?: boolean }) {
    this.maxQueueSize = opts.maxQueueSize;
    this.scheduledDelayMillis = opts.scheduledDelayMillis;
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
      // Flush immediately without awaiting to prevent blocking
      // but still allow the queue to be drained
      this.flush().catch((err) => this.logError("BatchLogProcessor flush failed", err));
    }
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
        // Put failed batch back at the front of the queue
        this.queue.unshift(...batch);
        
        // Retry with exponential backoff
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          const delay = Math.min(1000 * Math.pow(2, this.retryCount - 1), 10000);
          this.logError(`Log export failed, retrying in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`, err);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          // Don't auto-retry here - let the next flush() call handle it
          // This prevents infinite loops and allows proper batching
        } else {
          this.logError(`Log export failed after ${this.maxRetries} retries, ${batch.length} logs returned to queue`, err);
          // Reset retry count so future batches can retry
          this.retryCount = 0;
        }
        
        // If queue exceeds max size, drop oldest items (from the end)
        if (this.queue.length > this.maxQueueSize) {
          const dropped = this.queue.length - this.maxQueueSize;
          this.queue = this.queue.slice(0, this.maxQueueSize);
          this.logError(`Dropped ${dropped} logs due to buffer overflow`, err);
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
    }));
    logProcessors.push(new BatchLogProcessor(transport, {
      maxQueueSize,
      scheduledDelayMillis,
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

  const flush = async () => {
    await Promise.all([
      ...spanProcessors.map((p) => p.forceFlush()),
      ...logProcessors.map((p) => p.forceFlush()),
    ]);
    for (const transport of opts.transports) {
      await transport.flush();
    }
  };

  const shutdown = async () => {
    await flush();
    await Promise.all([
      ...spanProcessors.map((p) => p.shutdown()),
      ...logProcessors.map((p) => p.shutdown()),
    ]);
    for (const transport of opts.transports) {
      await transport.shutdown();
    }
  };

  return { tracerProvider, loggerProvider, flush, shutdown };
}
