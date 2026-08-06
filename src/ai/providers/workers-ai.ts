/**
 * Cloudflare Workers AI binding wrapper.
 *
 * Workers AI isn't called via fetch — it's a binding on `env.AI` with a
 * `.run(model, inputs)` method. So we can't use the fetch interceptor for
 * it; we provide a typed wrapper instead.
 *
 * Usage:
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
 *
 * The wrapper:
 * - Creates an OTel CLIENT span with gen_ai.* attributes
 * - Captures token usage from the Workers AI response shape
 * - Computes cost from the bundled price table (Workers AI section)
 * - Records errors and propagates them to the caller
 * - Flushes telemetry via the logger (caller is responsible for ctx.waitUntil)
 */

import type { FlareLog } from "../../client";
import type { AITokenUsage, AICallRecord, AIOperation } from "../types";
import { computeCost } from "../cost";
import { attachRecordToSpan } from "../span-attributes";

/**
 * The Workers AI binding shape — minimal subset we depend on.
 * The real type is exported by `@cloudflare/workers-types`; we redeclare
 * here to avoid adding a peer dependency.
 */
export interface WorkersAIBinding {
  run(
    model: string,
    inputs: Record<string, unknown> | ReadableStream | Request,
    options?: { gateway?: { id?: string; cacheId?: string; skipCache?: boolean; cacheTtl?: number } }
  ): Promise<Record<string, unknown>>;
}

/**
 * The wrapped run() signature — same as the original, but with an optional
 * tags argument for per-call metadata (route, customer ID, etc.).
 */
export interface WrappedWorkersAI {
  run(
    model: string,
    inputs: Record<string, unknown> | ReadableStream | Request,
    options?: {
      gateway?: { id?: string; cacheId?: string; skipCache?: boolean; cacheTtl?: number };
      /** Tags attached to the AI span (e.g. { route: "/chat", customer: "acme" }). */
      tags?: Record<string, string>;
    }
  ): Promise<Record<string, unknown>>;
}

/**
 * Wrap a Workers AI binding so every `.run()` call gets instrumented.
 *
 * Returns a new object with the same `.run()` signature plus an optional
 * `tags` field on the options arg.
 */
export function wrapWorkersAI(
  binding: WorkersAIBinding,
  logger: FlareLog
): WrappedWorkersAI {
  return {
    async run(model, inputs, options) {
      const startTime = Date.now();
      const ttfbMark = { ttfb: undefined as number | undefined };

      // Derive operation type from the model name. Workers AI has text,
      // image, embedding, and speech models — distinguished by prefix.
      const operation = inferWorkersAIOperation(model);

      const record: AICallRecord = {
        provider: "workers_ai",
        model,
        operation,
        tokens: {},
        latency: {},
        tags: options?.tags,
      };

      // Use startSpan so the span is active for any nested log calls.
      return logger.startSpan(
        `ai.workers_ai ${model}`,
        async (span) => {
          span.setAttribute("gen_ai.provider.name", "workers_ai");
          span.setAttribute("gen_ai.request.model", model);
          span.setAttribute("gen_ai.operation.name", operation);

          try {
            // Mark TTFB — for binding calls, this is "time until the
            // promise resolved," which is a reasonable proxy.
            const result = await binding.run(model, inputs, options?.gateway ? { gateway: options.gateway } : undefined);
            ttfbMark.ttfb = Date.now() - startTime;

            // Workers AI response shape varies by model. Most text models
            // return { response: string, usage: { prompt_tokens, completion_tokens } }.
            // Embedding models return { shape: [n,m], data: number[][] }.
            const usage = extractWorkersAIUsage(result, operation);
            record.tokens = usage;
            record.latency = {
              ttfb: ttfbMark.ttfb,
              total: Date.now() - startTime,
            };

            const cost = computeCost(model, "workers_ai", usage, operation);
            record.costUsd = cost;

            // Attach all fields as span attributes (gen_ai.* + flarelog.ai.*).
            attachRecordToSpan(span, record);

            // Also emit a structured log entry — gives the dashboard a
            // searchable record with full metadata.
            logger.info(`AI call: ${model}`, {
              "flarelog.ai.record": record,
              "flarelog.kind": "ai_call",
            });

            return result;
          } catch (err) {
            const elapsed = Date.now() - startTime;
            record.latency = { ttfb: ttfbMark.ttfb, total: elapsed };
            record.errorType = err instanceof Error ? err.name : "Error";
            record.errorMessage = err instanceof Error ? err.message : String(err);

            attachRecordToSpan(span, record);
            span.recordException(err as Error);

            logger.error(`AI call failed: ${model}`, {
              "flarelog.ai.record": record,
              "flarelog.kind": "ai_call",
              "flarelog.ai.error": true,
            });

            throw err;
          }
        },
        {
          // CLIENT span: we're a client of the Workers AI service.
          kind: 2, // SpanKind.CLIENT — referenced by number to avoid
                   // importing the enum (which would pull in otel/types.ts).
        }
      );
    },
  };
}

/**
 * Workers AI model name → operation type.
 *
 * Naming convention used by Cloudflare:
 *   @cf/meta/llama-*         → text/chat
 *   @cf/mistral/*            → text/chat
 *   @cf/qwen/*               → text/chat
 *   @cf/baai/bge-*           → embedding
 *   @cf/meta/m2m100-*        → translation (treated as text)
 *   @cf/openai/whisper-*     → audio (transcription)
 *   @cf/stabilityai/*        → image
 */
function inferWorkersAIOperation(model: string): AIOperation {
  const m = model.toLowerCase();
  if (m.includes("/bge-")) return "embedding";
  if (m.includes("/whisper-")) return "audio";
  if (m.includes("/stable-") || m.includes("/sdxl") || m.includes("/dreamshaper")) return "image";
  if (m.includes("/llama-") || m.includes("/mistral-") || m.includes("/qwen") || m.includes("/phi-")) return "chat";
  return "unknown";
}

/**
 * Extract token usage from a Workers AI response.
 *
 * Workers AI response shapes are unfortunately inconsistent across models.
 * This function checks the most common shapes:
 *   - { response: string, usage: { prompt_tokens, completion_tokens, total_tokens } }
 *   - { result: { response: string, usage: {...} } }
 *   - { data: number[][], shape: [n, m] }  (embeddings — no usage returned)
 */
function extractWorkersAIUsage(
  result: Record<string, unknown>,
  _operation: AIOperation
): AITokenUsage {
  const tokens: AITokenUsage = {};

  // Try direct usage
  const usage = (result.usage ?? (result.result as Record<string, unknown> | undefined)?.usage) as
    | Record<string, unknown>
    | undefined;

  if (usage && typeof usage === "object") {
    if (typeof usage.prompt_tokens === "number") tokens.input = usage.prompt_tokens;
    else if (typeof usage.input_tokens === "number") tokens.input = usage.input_tokens;
    if (typeof usage.completion_tokens === "number") tokens.output = usage.completion_tokens;
    else if (typeof usage.output_tokens === "number") tokens.output = usage.output_tokens;
  }

  return tokens;
}

