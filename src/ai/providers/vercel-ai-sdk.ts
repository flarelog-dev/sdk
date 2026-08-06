/**
 * Vercel AI SDK integration.
 *
 * The `ai` package (https://sdk.vercel.ai/docs) abstracts over OpenAI,
 * Anthropic, Google, Mistral, etc. with a unified API:
 *   - `generateText({ model, prompt })` — non-streaming
 *   - `streamText({ model, prompt })` — streaming
 *   - `generateObject({ model, schema, prompt })` — typed JSON output
 *
 * Calls don't go through `fetch()` directly (the AI SDK uses provider
 * packages that may use undici, custom clients, etc.), so the fetch
 * interceptor won't catch them.
 *
 * This module provides a wrapper that hooks into the AI SDK's lifecycle
 * events (`onStepFinish`, `onFinish`) to emit FlareLog spans + logs.
 *
 * Usage:
 * ```ts
 * import { generateText, streamText } from "ai";
 * import { openai } from "@ai-sdk/openai";
 * import { withFlarelog } from "@flarelog/sdk/ai/vercel";
 *
 * const result = await withFlarelog(
 *   generateText({
 *     model: openai("gpt-4o"),
 *     messages: [{ role: "user", content: "Hello" }],
 *   }),
 *   { logger, tags: { route: "/chat" } }
 * );
 * ```
 *
 * Or wrap once at startup:
 * ```ts
 * const ai = createFlarelogAI(logger);
 * const result = await ai.generateText({ model: openai("gpt-4o"), prompt: "Hi" });
 * ```
 */

import type { FlareLog } from "../../client";
import type { AICallRecord, AIProvider } from "../types";
import { attachRecordToSpan } from "../span-attributes";
import { computeCost } from "../cost";

/**
 * Wrap a Vercel AI SDK promise (from `generateText`, `streamText`,
 * `generateObject`) with FlareLog instrumentation.
 *
 * The AI SDK exposes lifecycle callbacks (`onFinish`, `onStepFinish`) on
 * the options object — but those fire inside the call. This wrapper
 * instead wraps the returned promise, reading the final result to extract
 * usage and emit a span.
 *
 * For streaming, we attach to the stream's `onFinish` callback (set after
 * the stream completes).
 */
export async function withFlarelog<T extends AISDKResult>(
  promise: Promise<T>,
  opts: {
    logger: FlareLog;
    /** Tags attached to the span (e.g. { route: "/chat", customer: "acme" }). */
    tags?: Record<string, string>;
    /** Provider hint (used for cost lookup). Auto-detected from the model ID if omitted. */
    provider?: AIProvider;
  }
): Promise<T> {
  const logger = opts.logger;
  const startTime = Date.now();

  // We don't know the model/provider until the result resolves —
  // start the span now with placeholder attributes, then patch them in.
  return logger.startSpan(
    "ai.vercel_sdk",
    async (span) => {
      span.setAttribute("gen_ai.provider.name", "vercel_ai_sdk");

      try {
        const result = await promise;

        // Extract usage + model from the result.
        const usage = result.usage ?? {};
        const modelId = ((result as { model?: { id?: string } }).model?.id) ?? "unknown";
        const provider = opts.provider ?? detectProviderFromModelId(modelId);

        const record: AICallRecord = {
          provider,
          model: modelId,
          operation: "chat",
          tokens: {
            input: usage.promptTokens,
            output: usage.completionTokens,
          },
          latency: {
            total: Date.now() - startTime,
          },
          tags: opts.tags,
        };

        // Streamed responses have a `streamed` flag (true for streamText).
        if ((result as { stream?: boolean }).stream) {
          record.streamed = true;
        }

        record.costUsd = computeCost(modelId, provider, record.tokens, "chat");

        attachRecordToSpan(span, record);

        logger.info(`AI call: ${modelId}`, {
          "flarelog.ai.record": record,
          "flarelog.kind": "ai_call",
          "flarelog.ai.wrapper": "vercel_sdk",
        });

        return result;
      } catch (err) {
        const record: AICallRecord = {
          provider: opts.provider ?? "vercel_ai_sdk",
          model: "unknown",
          operation: "chat",
          tokens: {},
          latency: { total: Date.now() - startTime },
          errorType: err instanceof Error ? err.name : "Error",
          errorMessage: err instanceof Error ? err.message : String(err),
          tags: opts.tags,
        };
        attachRecordToSpan(span, record);
        span.recordException(err as Error);

        logger.error(`AI call failed: vercel_sdk`, {
          "flarelog.ai.record": record,
          "flarelog.kind": "ai_call",
          "flarelog.ai.wrapper": "vercel_sdk",
          "flarelog.ai.error": true,
        });

        throw err;
      }
    },
    { kind: 2 }
  );
}

/**
 * Minimal shape we need from a Vercel AI SDK result.
 * The real types are exported by `ai` — we declare a structural subset
 * to avoid adding `ai` as a peer dependency.
 */
export interface AISDKResult {
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  model?: {
    id?: string;
    provider?: string;
  };
  /** True for streamText results. */
  stream?: boolean;
}

/**
 * Detect the provider from a Vercel AI SDK model ID.
 *
 * Model IDs in the AI SDK follow the convention `<provider>.<model>`:
 *   - openai.gpt-4o
 *   - anthropic.claude-3-5-sonnet
 *   - google.gemini-2.5-flash
 *   - mistral.mistral-large-latest
 */
function detectProviderFromModelId(id: string): AIProvider {
  const lower = id.toLowerCase();
  if (lower.startsWith("openai.")) return "openai";
  if (lower.startsWith("anthropic.")) return "anthropic";
  if (lower.startsWith("google.")) return "google";
  if (lower.startsWith("mistral.")) return "mistral";
  if (lower.startsWith("cohere.")) return "cohere";
  // Workers AI doesn't go through the AI SDK typically — skip.
  return "generic";
}

/**
 * Factory: wrap a Vercel AI SDK namespace so every call is instrumented.
 *
 * @example
 * ```ts
 * import * as ai from "ai";
 * const wrappedAI = createFlarelogAI(logger, ai);
 *
 * // All calls are now instrumented:
 * await wrappedAI.generateText({ model: openai("gpt-4o"), prompt: "Hi" });
 * ```
 *
 * Note: this requires passing the entire `ai` module. For tree-shaking,
 * prefer the per-call `withFlarelog()` wrapper instead.
 */
export function createFlarelogAI<T extends AISDKModule>(
  logger: FlareLog,
  aiModule: T
): T {
  const wrap = <F extends (...args: never[]) => Promise<AISDKResult>>(
    fn: F,
    name: string
  ): F => {
    return ((...args: never[]) => {
      const result = fn(...args);
      return withFlarelog(result, { logger }).then((r) => {
        // Re-tag with the call name for the dashboard
        logger.debug(`AI SDK call: ${name}`);
        return r;
      });
    }) as F;
  };

  return new Proxy(aiModule, {
    get(target, prop) {
      if (typeof prop !== "string") {
        return (target as Record<string, unknown>)[prop as unknown as string];
      }
      const value = (target as Record<string, unknown>)[prop];
      if (typeof value === "function") {
        // Wrap known call-producing functions.
        if (prop === "generateText" || prop === "streamText" || prop === "generateObject") {
          return wrap(value as never as (...args: never[]) => Promise<AISDKResult>, prop);
        }
      }
      return value;
    },
  });
}

export interface AISDKModule {
  generateText?: (...args: never[]) => Promise<AISDKResult>;
  streamText?: (...args: never[]) => Promise<AISDKResult>;
  generateObject?: (...args: never[]) => Promise<AISDKResult>;
  [key: string]: unknown;
}
