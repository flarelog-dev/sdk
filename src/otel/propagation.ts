import { activeContext, getSpanContext, setSpan, withContext, ensureContextManager } from "./context";
import type { Context, Span, SpanContext } from "./types";

export const EXTRACTED_SPAN_CONTEXT_KEY = Symbol("flarelog.extractedSpanContext");

const TRACEPARENT_HEADER = "traceparent";

export function ensurePropagatorInstalled(): void {
  ensureContextManager();
}

function parseTraceparent(raw: string): SpanContext | undefined {
  const parts = raw.trim().split("-");
  if (parts.length !== 4) return undefined;
  const [, traceId, spanId, flags] = parts;
  if (traceId.length !== 32 || spanId.length !== 16 || flags.length !== 2) return undefined;
  if (traceId === "00000000000000000000000000000000") return undefined;
  if (spanId === "0000000000000000") return undefined;
  return {
    traceId,
    spanId,
    traceFlags: parseInt(flags, 16),
    isRemote: true,
  };
}

function formatTraceparent(ctx: SpanContext): string {
  const flags = ctx.traceFlags.toString(16).padStart(2, "0");
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

function headersToCarrier(headers: Headers): Record<string, string> {
  const carrier: Record<string, string> = {};
  headers.forEach((value, key) => {
    carrier[key.toLowerCase()] = value;
  });
  return carrier;
}

export function extractContext(headers: Headers): Context {
  ensurePropagatorInstalled();
  const carrier = headersToCarrier(headers);
  const raw = carrier[TRACEPARENT_HEADER];
  if (!raw) return activeContext();
  const spanContext = parseTraceparent(raw);
  if (!spanContext) return activeContext();
  const ctx = new Map(activeContext());
  ctx.set(EXTRACTED_SPAN_CONTEXT_KEY, spanContext);
  return ctx;
}

export function injectContext(headers: Headers, ctx: Context = activeContext()): Headers {
  ensurePropagatorInstalled();
  const spanCtx = getSpanContext(ctx);
  if (spanCtx) {
    headers.set(TRACEPARENT_HEADER, formatTraceparent(spanCtx));
  }
  return headers;
}

export function getActiveSpanContext(): SpanContext | undefined {
  return getSpanContext(activeContext());
}

export function withActiveSpan<T>(span: Span, fn: () => T): T {
  const ctx = setSpan(activeContext(), span);
  return withContext(ctx, fn);
}

export { activeContext, setSpan, withContext };
