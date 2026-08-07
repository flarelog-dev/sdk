/**
 * AI inference observability for @flarelog/sdk.
 *
 * Public entry point. Re-exports the public API and provides the
 * `flarelogAI()` factory + `wrap()` helper.
 *
 * @example Zero-config auto-instrumentation
 * ```ts
 * import { flarelog } from "@flarelog/sdk";
 * import { flarelogAI } from "@flarelog/sdk/ai";
 *
 * const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });
 * const ai = flarelogAI(logger);
 *
 * // Now any fetch() to api.openai.com or api.anthropic.com is captured:
 * await fetch("https://api.openai.com/v1/chat/completions", {
 *   method: "POST",
 *   headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
 *   body: JSON.stringify({
 *     model: "gpt-4o-mini",
 *     messages: [{ role: "user", content: "Hello" }],
 *   }),
 * });
 * // → creates an OTel span "chat gpt-4o-mini" with token usage + cost
 * ```
 *
 * @example Workers AI
 * ```ts
 * import { wrapWorkersAI } from "@flarelog/sdk/ai";
 *
 * export default {
 *   async fetch(req, env, ctx) {
 *     const ai = wrapWorkersAI(env.AI, logger);
 *     const result = await ai.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
 *       messages: [{ role: "user", content: "Hello" }],
 *     });
 *     return Response.json(result);
 *   },
 * };
 * ```
 */

import type { FlareLog } from "../client";
import { instrumentFetch, uninstrumentFetch } from "./fetch-interceptor";
import type { AIInstrumentationConfig, AICallRecord } from "./types";
import { attachRecordToSpan, recordToLogAttributes } from "./span-attributes";
import { computeCost } from "./cost";
export type { WrappedWorkersAI, WorkersAIBinding } from "./providers/workers-ai";

/**
 * Handle returned by `flarelogAI()` — call `.dispose()` to remove all
 * instrumentation (restores the original fetch, etc.).
 */
export interface AIInstrumentationHandle {
  /** Remove all AI instrumentation installed by this handle. */
  dispose(): void;
}

/**
 * Enable AI inference observability on a FlareLog instance.
 *
 * By default, this:
 *  - Patches `globalThis.fetch` to intercept calls to OpenAI, Anthropic,
 *    and any user-configured extra hosts.
 *  - Injects the W3C traceparent header on outgoing AI calls so they
 *    correlate with the parent request span.
 *  - Captures token usage, latency (TTFB + total), cost in USD, tool calls,
 *    and errors.
 *  - Emits a structured log entry per call with `flarelog.kind: "ai_call"`.
 *
 * The instrumentation is global — calling `flarelogAI(logger)` twice with
 * different loggers is undefined. Use one logger per process.
 *
 * @returns a handle with a `.dispose()` method to remove instrumentation.
 */
export function flarelogAI(
  logger: FlareLog,
  config: AIInstrumentationConfig = {}
): AIInstrumentationHandle {
  const cleanupFetch = config.autoFetch === false
    ? () => {}
    : instrumentFetch(logger, config);

  return {
    dispose() {
      cleanupFetch();
      uninstrumentFetch();
    },
  };
}

/**
 * Explicit-wrap API for users who don't want global fetch patching.
 *
 * Wrap any function that makes an AI call — the wrapper creates an OTel
 * span around it, captures whatever the function returns (assumed to be a
 * Response or a structured object with `usage`), and emits a log entry.
 *
 * Use this when:
 *  - You want per-call tags that aren't derivable from the request URL
 *    (e.g. customer ID, feature flag, A/B variant).
 *  - You're using a client library that doesn't go through `fetch()`
 *    (rare — most do under the hood).
 *  - You want explicit control and don't trust global patching.
 *
 * @example
 * ```ts
 * const result = await wrap(
 *   () => openai.chat.completions.create({
 *     model: "gpt-4o",
 *     messages: [{ role: "user", content: "Hello" }],
 *   }),
 *   { logger, tags: { customer: "acme", route: "/chat" } }
 * );
 * ```
 *
 * **Streaming limitation:** `wrap()` captures usage from the resolved result.
 * If the function returns a stream or async iterator, usage may not be available
 * at resolution time. For streaming calls, prefer `flarelogAI()` (fetch interceptor)
 * or `withFlarelog()` (Vercel AI SDK), which handle stream consumption automatically.
 */

/**
 * Re-route an AI SDK client's internal `fetch` through `globalThis.fetch`.
 *
 * Both the OpenAI SDK (`openai` v4+) and the Anthropic SDK
 * (`@anthropic-ai/sdk`) capture `globalThis.fetch` at construction time
 * and cache it on `client.fetch` for the instance's lifetime. If the
 * client was constructed before `@flarelog/sdk/ai` was imported, it holds
 * a reference to the raw native fetch and bypasses all instrumentation.
 *
 * This function patches `client.fetch` to delegate to `globalThis.fetch`
 * (which is flarelog's inert wrapper). Call it after `flarelogAI()`:
 *
 * @example
 * ```ts
 * import OpenAI from "openai";
 * import Anthropic from "@anthropic-ai/sdk";
 * import { flarelogAI, wrapClient } from "@flarelog/sdk/ai";
 *
 * // Clients constructed early (e.g. at module scope in lib/ai.ts):
 * const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 * const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
 *
 * // Activate instrumentation:
 * flarelogAI(logger);
 * wrapClient(openai);      // re-routes client.fetch → globalThis.fetch
 * wrapClient(anthropic);   // same — works for any client with .fetch
 * ```
 *
 * **Not needed** if the client is constructed after `import "@flarelog/sdk/ai"`.
 */
export function wrapClient<T extends { fetch?: (...args: unknown[]) => unknown }>(client: T): T {
  const originalFetchRef = client.fetch;
  if (!originalFetchRef) return client;

  (client as Record<string, unknown>).fetch = function (this: unknown, ...args: unknown[]) {
    return (globalThis.fetch as (...a: unknown[]) => unknown).apply(undefined, args);
  };

  return client;
}
export async function wrap<T>(
  fn: () => Promise<T>,
  opts: {
    logger: FlareLog;
    /** Model name (required for cost lookup if the response doesn't include it). */
    model?: string;
    /** Provider name (default: "generic"). */
    provider?: "openai" | "anthropic" | "workers_ai" | "generic";
    /** Operation type (default: "chat"). */
    operation?: "chat" | "completion" | "embedding" | "image" | "audio" | "moderation";
    /** Per-call tags (attached as `flarelog.ai.tag.*` span attributes). */
    tags?: Record<string, string>;
  }
): Promise<T> {
  const logger = opts.logger;
  const model = opts.model ?? "unknown";
  const provider = opts.provider ?? "generic";
  const operation = opts.operation ?? "chat";

  const startTime = Date.now();
  const record: AICallRecord = {
    provider,
    model,
    operation,
    tokens: {},
    latency: {},
    tags: opts.tags,
  };

  return logger.startSpan(
    `${operation} ${model}`,
    async (span) => {
      span.setAttribute("gen_ai.provider.name", provider);
      span.setAttribute("gen_ai.request.model", model);
      span.setAttribute("gen_ai.operation.name", operation);

      try {
        const result = await fn();
        record.latency.total = Date.now() - startTime;

        extractUsageFromResult(result, record);

        record.costUsd = computeCost(record.model, provider, record.tokens, operation);

        attachRecordToSpan(span, record);

logger.info(`AI call: ${model}`, {
          "flarelog.ai.record": record,
          "flarelog.kind": "ai_call",
          ...recordToLogAttributes(record),
        });

        return result;
      } catch (err) {
        record.latency.total = Date.now() - startTime;
        record.errorType = err instanceof Error ? err.name : "Error";
        record.errorMessage = err instanceof Error ? err.message : String(err);
        attachRecordToSpan(span, record);
        span.recordException(err as Error);

        logger.error(`AI call failed: ${model}`, {
          "flarelog.ai.record": record,
          "flarelog.kind": "ai_call",
          "flarelog.ai.error": true,
          ...recordToLogAttributes(record),
        });

        throw err;
      }
    },
    { kind: 2 }
  );
}

function extractUsageFromResult(result: unknown, record: AICallRecord): void {
  if (!result || typeof result !== "object") return;
  const r = result as Record<string, unknown>;

  if (r.usage && typeof r.usage === "object") {
    const u = r.usage as Record<string, unknown>;
    const tokens: { input?: number; output?: number } = {};
    if (typeof u.prompt_tokens === "number") tokens.input = u.prompt_tokens;
    else if (typeof u.input_tokens === "number") tokens.input = u.input_tokens;
    if (typeof u.completion_tokens === "number") tokens.output = u.completion_tokens;
    else if (typeof u.output_tokens === "number") tokens.output = u.output_tokens;
    record.tokens = tokens;
  }
  if (typeof r.model === "string") record.model = r.model;
}

// Re-export everything that's part of the public API.
export { instrumentFetch, uninstrumentFetch, __setPassthroughFetch, __resetInterceptorState } from "./fetch-interceptor";
export { wrapWorkersAI } from "./providers/workers-ai";
export { openaiMatcher } from "./providers/openai";
export { anthropicMatcher } from "./providers/anthropic";
export { genericMatcher, bodyLooksLikeAI } from "./providers/generic";
export { withFlarelog, createFlarelogAI } from "./providers/vercel-ai-sdk";
export type { AISDKResult, AISDKModule } from "./providers/vercel-ai-sdk";
export { computeCost, formatCost } from "./cost";
export { lookupPrice, PRICE_TABLE, PROVIDER_FALLBACK } from "./cost-table";
export { parseSSEString, readSSEStream, isStreamDone } from "./sse";

export type {
  AIInstrumentationConfig,
  AICallRecord,
  AITokenUsage,
  AIToolCall,
  AILatency,
  AIProvider,
  AIOperation,
  PriceEntry,
  ProviderMatcher,
} from "./types";

export { attachRecordToSpan } from "./span-attributes";

