/**
 * Shared span-attribute helpers — attach an `AICallRecord` to an OTel span
 * using the OpenTelemetry GenAI semantic conventions.
 *
 * Extracted into its own module so both the fetch interceptor and the
 * Workers AI wrapper can use it without circular imports.
 */

import type { AICallRecord } from "./types";

/**
 * The minimal span interface we depend on.
 *
 * We use a structural type instead of importing `Span` from `../otel/types`
 * so this module is decoupled from OTel version churn. Any object that
 * exposes `setAttribute` and `recordException` will work.
 */
export interface AttributeSpan {
  setAttribute(key: string, value: unknown): unknown;
  recordException(err: Error): unknown;
  setStatus?(status: { code: number; message?: string }): unknown;
}

/**
 * Attach an AICallRecord's fields to a span as OTel attributes.
 *
 * Uses the standard OpenTelemetry GenAI semantic conventions
 * (https://opentelemetry.io/docs/specs/semconv/gen-ai/) so downstream
 * backends (Grafana, Honeycomb, Datadog) render them natively.
 *
 * FlareLog-specific attributes are prefixed with `flarelog.ai.*` and are
 * what the FlareLog dashboard queries directly.
 */
export function attachRecordToSpan(span: AttributeSpan, record: AICallRecord): void {
  // --- Standard OTel GenAI attributes ---
  span.setAttribute("gen_ai.provider.name", record.provider);
  span.setAttribute("gen_ai.response.model", record.model);
  span.setAttribute("gen_ai.operation.name", record.operation);

  if (record.tokens.input !== undefined) {
    span.setAttribute("gen_ai.usage.input_tokens", record.tokens.input);
  }
  if (record.tokens.output !== undefined) {
    span.setAttribute("gen_ai.usage.output_tokens", record.tokens.output);
  }
  if (record.tokens.cachedInput !== undefined) {
    span.setAttribute("gen_ai.usage.cache_read.input_tokens", record.tokens.cachedInput);
  }
  if (record.tokens.reasoning !== undefined) {
    span.setAttribute("gen_ai.usage.reasoning.output_tokens", record.tokens.reasoning);
  }
  if (record.tokens.cacheCreationInput !== undefined) {
    span.setAttribute("gen_ai.usage.cache_creation.input_tokens", record.tokens.cacheCreationInput);
  }

  // --- FlareLog-specific attributes ---
  if (record.latency.ttfb !== undefined) {
    span.setAttribute("flarelog.ai.ttfb_ms", record.latency.ttfb);
  }
  if (record.latency.total !== undefined) {
    span.setAttribute("flarelog.ai.total_ms", record.latency.total);
  }
  if (record.latency.streamChunks !== undefined) {
    span.setAttribute("flarelog.ai.stream_chunks", record.latency.streamChunks);
  }
  if (record.latency.tokensPerSecond !== undefined) {
    span.setAttribute("flarelog.ai.tokens_per_second", record.latency.tokensPerSecond);
  }
  if (record.costUsd !== undefined) {
    span.setAttribute("flarelog.ai.cost_usd", record.costUsd);
  }
  if (record.status !== undefined) {
    span.setAttribute("flarelog.ai.status_code", record.status);
  }
  if (record.requestId) {
    span.setAttribute("flarelog.ai.request_id", record.requestId);
  }
  if (record.errorType) {
    span.setAttribute("flarelog.ai.error_type", record.errorType);
  }
  if (record.streamed) {
    span.setAttribute("flarelog.ai.streamed", true);
  }
  if (record.retries !== undefined && record.retries > 0) {
    span.setAttribute("flarelog.ai.retries", record.retries);
  }
  if (record.toolCalls && record.toolCalls.length > 0) {
    span.setAttribute("flarelog.ai.tool_call_count", record.toolCalls.length);
    // OTel supports homogeneous string arrays — list of tool names.
    span.setAttribute(
      "flarelog.ai.tool_call_names",
      record.toolCalls.map((t) => t.name)
    );
  }

  // --- User-provided tags ---
  if (record.tags) {
    for (const [k, v] of Object.entries(record.tags)) {
      span.setAttribute(`flarelog.ai.tag.${k}`, v);
    }
  }
}
