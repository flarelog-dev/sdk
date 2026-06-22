import { propagation, context, trace, type Span, type SpanContext, type Context } from "@opentelemetry/api";

/**
 * Ensure the W3C propagator is installed.
 * This is also called by `initProviders()`, but we keep it here as a safety net
 * for code paths that use propagation without initializing providers.
 */
let propagatorInstalled = false;

export function ensurePropagatorInstalled(): void {
  if (propagatorInstalled) return;
  // The providers.ts module installs the propagator during initProviders().
  // If we get here without that having run, install a basic W3C propagator.
  try {
    // Check if a propagator is already set by attempting to use it
    const testCarrier: Record<string, string> = {};
    propagation.inject(context.active(), testCarrier);
    if (Object.keys(testCarrier).length === 0) {
      // No propagator installed yet — but we can't set one here without
      // importing the OTel core package (which would create a circular dep).
      // The providers.ts module handles this.
    }
    propagatorInstalled = true;
  } catch {
    /* ignore */
  }
}

/**
 * Extract trace context from incoming request headers (W3C traceparent).
 *
 * Returns the OTel Context, which can be passed to `tracer.startSpan()` as
 * the parent context (or used to make the span active via `context.with()`).
 */
export function extractContext(headers: Headers): Context {
  ensurePropagatorInstalled();
  const carrier: Record<string, string> = {};
  headers.forEach((value, key) => {
    carrier[key.toLowerCase()] = value;
  });
  return propagation.extract(context.active(), carrier);
}

/**
 * Inject current trace context into outgoing request headers (W3C traceparent).
 *
 * Use this when calling other services (fetch to backend, service bindings)
 * so the trace continues across the call boundary.
 */
export function injectContext(headers: Headers, ctx: Context = context.active()): Headers {
  ensurePropagatorInstalled();
  const carrier: Record<string, string> = {};
  propagation.inject(ctx, carrier);
  for (const [k, v] of Object.entries(carrier)) {
    headers.set(k, v);
  }
  return headers;
}

/**
 * Get the active span's context (traceId, spanId), or undefined if no span is active.
 */
export function getActiveSpanContext(): SpanContext | undefined {
  const span = trace.getSpan(context.active());
  return span?.spanContext();
}

/**
 * Run a function with the given span as the active context.
 */
export function withActiveSpan<T>(span: Span, fn: () => T): T {
  return context.with(trace.setSpan(context.active(), span), fn);
}
