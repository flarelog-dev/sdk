import type { Resource, ReadableSpan, ReadableLogRecord, TracerProvider, LoggerProvider, Logger, SpanExporter, LogRecordExporter, InstrumentationScope } from "./types";
import { ensureContextManager, getSpanContext } from "./context";
import { activeContext } from "./context";
import { SimpleTracerProvider } from "./span";
import type { Transport } from "./transport";

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
  constructor(transport: Transport) {
    this.exporter = new TransportSpanExporter(transport);
  }
  async onEnd(span: ReadableSpan): Promise<void> {
    await this.exporter.export([span]);
  }
  async forceFlush(): Promise<void> { await this.exporter.forceFlush(); }
  async shutdown(): Promise<void> { await this.exporter.shutdown(); }
}

class BatchSpanProcessor {
  private queue: ReadableSpan[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private readonly maxQueueSize: number;
  private readonly scheduledDelayMillis: number;
  private exporter: TransportSpanExporter;

  constructor(transport: Transport, opts: { maxQueueSize: number; scheduledDelayMillis: number }) {
    this.maxQueueSize = opts.maxQueueSize;
    this.scheduledDelayMillis = opts.scheduledDelayMillis;
    this.exporter = new TransportSpanExporter(transport);
    if (this.scheduledDelayMillis > 0) {
      this.timer = setInterval(() => { this.flush().catch(() => {}); }, this.scheduledDelayMillis);
    }
  }

  async onEnd(span: ReadableSpan): Promise<void> {
    this.queue.push(span);
    if (this.queue.length >= this.maxQueueSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    await this.exporter.export(batch);
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
  constructor(transport: Transport) {
    this.exporter = new TransportLogExporter(transport);
  }
  async onEmit(log: ReadableLogRecord): Promise<void> {
    await this.exporter.export([log]);
  }
  async forceFlush(): Promise<void> { await this.exporter.forceFlush(); }
  async shutdown(): Promise<void> { await this.exporter.shutdown(); }
}

class BatchLogProcessor {
  private queue: ReadableLogRecord[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private readonly maxQueueSize: number;
  private readonly scheduledDelayMillis: number;
  private exporter: TransportLogExporter;

  constructor(transport: Transport, opts: { maxQueueSize: number; scheduledDelayMillis: number }) {
    this.maxQueueSize = opts.maxQueueSize;
    this.scheduledDelayMillis = opts.scheduledDelayMillis;
    this.exporter = new TransportLogExporter(transport);
    if (this.scheduledDelayMillis > 0) {
      this.timer = setInterval(() => { this.flush().catch(() => {}); }, this.scheduledDelayMillis);
    }
  }

  async onEmit(log: ReadableLogRecord): Promise<void> {
    this.queue.push(log);
    if (this.queue.length >= this.maxQueueSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    await this.exporter.export(batch);
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
          p.onEmit(logRecord).catch(() => {});
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
    if (isWorker) {
      spanProcessors.push(new SimpleSpanProcessor(transport));
      logProcessors.push(new SimpleLogProcessor(transport));
    } else {
      spanProcessors.push(new BatchSpanProcessor(transport, {
        maxQueueSize: opts.maxQueueSize ?? 100,
        scheduledDelayMillis: opts.scheduledDelayMillis ?? 5000,
      }));
      logProcessors.push(new BatchLogProcessor(transport, {
        maxQueueSize: opts.maxQueueSize ?? 100,
        scheduledDelayMillis: opts.scheduledDelayMillis ?? 5000,
      }));
    }
  }

  const onSpanEnd = (span: ReadableSpan) => {
    for (const p of spanProcessors) {
      p.onEnd(span).catch(() => {});
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
