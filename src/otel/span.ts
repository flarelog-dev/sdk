import type { HrTime, ReadableSpan, Resource, SpanContext, SpanOptions, SpanStatus, TimedEvent, InstrumentationScope, Context } from "./types";
import { SpanKind, SpanStatusCode, type Span as ISpan, type Tracer as ITracer, type TracerProvider } from "./types";
import { EXTRACTED_SPAN_CONTEXT_KEY } from "./propagation";
import { getSpanContext } from "./context";

function nowHrTime(): HrTime {
  const ms = Date.now();
  return [Math.floor(ms / 1000), (ms % 1000) * 1_000_000];
}

function randomSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class Span implements ISpan {
  private _ended = false;
  private _attributes: Record<string, unknown> = {};
  private _events: TimedEvent[] = [];
  private _links: Array<{ context: SpanContext; attributes?: Record<string, unknown> }> = [];
  private _status: SpanStatus = { code: SpanStatusCode.UNSET };
  private _startTime: HrTime;
  private _endTime: HrTime = [0, 0];
  private _spanContext: SpanContext;
  private _parentSpanContext?: SpanContext;
  private _droppedAttributesCount = 0;
  private _droppedEventsCount = 0;
  private _droppedLinksCount = 0;

  constructor(
    private readonly _name: string,
    private readonly _kind: SpanKind,
    private readonly _resource: Resource,
    private readonly _instrumentationScope: InstrumentationScope,
    options?: SpanOptions,
    parentSpanContext?: SpanContext
  ) {
    this._startTime = nowHrTime();
    this._kind = options?.kind ?? SpanKind.INTERNAL;
    this._attributes = { ...(options?.attributes as Record<string, unknown> ?? {}) };
    this._parentSpanContext = parentSpanContext;

    if (parentSpanContext) {
      this._spanContext = {
        traceId: parentSpanContext.traceId,
        spanId: randomSpanId(),
        traceFlags: parentSpanContext.traceFlags,
      };
    } else {
      this._spanContext = {
        traceId: randomTraceId(),
        spanId: randomSpanId(),
        traceFlags: 1,
      };
    }
  }

  spanContext(): SpanContext {
    return this._spanContext;
  }

  setAttribute(key: string, value: unknown): this {
    if (this._ended) return this;
    this._attributes[key] = value;
    return this;
  }

  setAttributes(attrs: Record<string, unknown>): this {
    if (this._ended) return this;
    for (const [k, v] of Object.entries(attrs)) {
      this._attributes[k] = v;
    }
    return this;
  }

  addEvent(name: string, attrs?: Record<string, unknown>): this {
    if (this._ended) return this;
    this._events.push({ name, time: nowHrTime(), attributes: attrs });
    return this;
  }

  recordException(err: Error, time?: HrTime): this {
    if (this._ended) return this;
    this._events.push({
      name: "exception",
      time: time ?? nowHrTime(),
      attributes: {
        "exception.type": err.name,
        "exception.message": err.message,
        "exception.stacktrace": err.stack ?? "",
      },
    });
    return this;
  }

  setStatus(status: SpanStatus): this {
    if (this._ended) return this;
    this._status = status;
    return this;
  }

  end(): void {
    if (this._ended) return;
    this._ended = true;
    this._endTime = nowHrTime();
    this._onEnd?.(this.toReadable());
  }

  private _onEnd?: (span: ReadableSpan) => void;

  setOnEnd(fn: (span: ReadableSpan) => void): this {
    this._onEnd = fn;
    return this;
  }

  toReadable(): ReadableSpan {
    return {
      name: this._name,
      kind: this._kind,
      spanContext: this._spanContext,
      parentSpanContext: this._parentSpanContext,
      startTime: this._startTime,
      endTime: this._endTime,
      attributes: this._attributes,
      status: this._status,
      events: this._events,
      links: this._links,
      resource: this._resource,
      instrumentationScope: this._instrumentationScope,
      droppedAttributesCount: this._droppedAttributesCount,
      droppedEventsCount: this._droppedEventsCount,
      droppedLinksCount: this._droppedLinksCount,
    };
  }
}

export class Tracer implements ITracer {
  private readonly _scope: InstrumentationScope;
  private readonly _resource: Resource;
  private readonly _onSpanEnd: (span: ReadableSpan) => void;

  constructor(
    name: string,
    version: string,
    resource: Resource,
    onSpanEnd: (span: ReadableSpan) => void
  ) {
    this._scope = { name, version };
    this._resource = resource;
    this._onSpanEnd = onSpanEnd;
  }

  startSpan(name: string, options?: SpanOptions, parentContext?: Context): Span {
    const parentSpanCtx = parentContext ? (getSpanContext(parentContext) ?? parentContext.get(EXTRACTED_SPAN_CONTEXT_KEY) as SpanContext | undefined) : undefined;
    const span = new Span(name, options?.kind ?? SpanKind.INTERNAL, this._resource, this._scope, options, parentSpanCtx);
    span.setOnEnd(this._onSpanEnd);
    return span;
  }
}

export class SimpleTracerProvider implements TracerProvider {
  private readonly _resource: Resource;
  private readonly _onSpanEnd: (span: ReadableSpan) => void;

  constructor(resource: Resource, onSpanEnd: (span: ReadableSpan) => void) {
    this._resource = resource;
    this._onSpanEnd = onSpanEnd;
  }

  getTracer(name: string, version?: string): Tracer {
    return new Tracer(name, version ?? "", this._resource, this._onSpanEnd);
  }
}
