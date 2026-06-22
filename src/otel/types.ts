export type HrTime = [number, number];

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  isRemote?: boolean;
  traceState?: string;
}

export interface Resource {
  attributes: Record<string, unknown>;
  merge(other: Resource | null): Resource;
}

export interface InstrumentationScope {
  name: string;
  version?: string;
  schemaUrl?: string;
  attributes?: Record<string, unknown>;
  droppedAttributesCount?: number;
}

export interface SpanStatus {
  code: SpanStatusCode;
  message?: string;
}

export interface TimedEvent {
  name: string;
  time: HrTime;
  attributes?: Record<string, unknown>;
  droppedAttributesCount?: number;
}

export interface ReadableSpan {
  name: string;
  kind: SpanKind;
  spanContext: SpanContext;
  parentSpanContext?: SpanContext;
  startTime: HrTime;
  endTime: HrTime;
  attributes: Record<string, unknown>;
  status: SpanStatus;
  events: TimedEvent[];
  links: Array<{ context: SpanContext; attributes?: Record<string, unknown> }>;
  resource: Resource;
  instrumentationScope: InstrumentationScope;
  droppedAttributesCount: number;
  droppedEventsCount: number;
  droppedLinksCount: number;
}

export interface ReadableLogRecord {
  hrTime: HrTime;
  hrTimeObserved: HrTime;
  severityNumber?: number;
  severityText?: string;
  body: unknown;
  attributes: Record<string, unknown>;
  spanContext?: SpanContext;
  instrumentationScope: InstrumentationScope;
  resource: Resource;
  droppedAttributesCount?: number;
  eventName?: string;
}

export enum SpanKind {
  INTERNAL = 0,
  SERVER = 1,
  CLIENT = 2,
  PRODUCER = 3,
  CONSUMER = 4,
}

export enum SpanStatusCode {
  UNSET = 0,
  OK = 1,
  ERROR = 2,
}

export type Attributes = Record<string, string | number | boolean | string[] | number[] | boolean[]>;

export interface SpanOptions {
  kind?: SpanKind;
  attributes?: Attributes;
}

export interface Logger {
  emit(record: {
    severityNumber?: number;
    severityText?: string;
    body?: unknown;
    attributes?: Record<string, unknown>;
    context?: Context;
  }): void;
}

export interface Tracer {
  startSpan(name: string, options?: SpanOptions, parentContext?: Context): Span;
}

export type Context = Map<symbol, unknown>;

export interface Span {
  spanContext(): SpanContext;
  setAttribute(key: string, value: unknown): this;
  setAttributes(attrs: Record<string, unknown>): this;
  addEvent(name: string, attrs?: Record<string, unknown>): this;
  recordException(err: Error, time?: HrTime): this;
  setStatus(status: SpanStatus): this;
  end(): void;
}

export interface TracerProvider {
  getTracer(name: string, version?: string): Tracer;
}

export interface LoggerProvider {
  getLogger(name: string, version?: string): Logger;
}

export interface ExportResult {
  code: 0 | 1;
  error?: unknown;
}

export interface SpanExporter {
  export(spans: ReadableSpan[]): Promise<void>;
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface LogRecordExporter {
  export(logs: ReadableLogRecord[]): Promise<void>;
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}
