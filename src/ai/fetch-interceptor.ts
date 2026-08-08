/**
 * Global fetch() interceptor for AI inference observability.
 *
 * Uses an **inert pre-wrapper** installed at module import time. This
 * ensures that any client SDK (e.g. `openai`) which captures
 * `globalThis.fetch` at construction time will capture our wrapper —
 * not the raw undici/native fetch. When `flarelogAI()` is later called,
 * the wrapper "activates" and begins intercepting AI calls.
 *
 * The wrapper itself is a plain (non-async) function that checks a
 * closure variable — near-zero overhead when inactive (~2-5ns/call).
 *
 * Activation flow:
 * 1. Module import → installs inert wrapper on `globalThis.fetch`
 * 2. `new OpenAI()` → SDK captures our wrapper as `this.fetch`
 * 3. `flarelogAI(logger)` → sets `activeInterceptor`, wrapper starts routing
 *
 * When active, the wrapper:
 * 1. Decides whether the outgoing request is an AI call (matches against
 *    OpenAI/Anthropic hostnames, plus user-configured extras).
 * 2. If yes: clones the request, extracts the body (to read the model name),
 *    creates an OTel CLIENT span, captures TTFB, parses the response body
 *    (or streams through it for SSE), extracts token usage + tool calls,
 *    computes cost, and emits a structured log entry.
 * 3. If no: passes through unchanged (zero overhead).
 *
 * Design constraints:
 * - Zero-copy: the response body is *not* buffered for non-streaming
 *   responses — we `tee()` and let the consumer read one branch while we
 *   parse the other.
 * - Trace propagation: by default injects the W3C traceparent header so
 *   the AI call's span is a child of the active request span.
 * - Idempotent: calling `instrumentFetch()` twice is a no-op.
 * - Safe: any thrown error inside the wrapper is swallowed and the
 *   passthrough fetch is called — we never break the user's app because of
 *   an instrumentation bug.
 */

import type { FlareLog } from "../client";
import type {
  AIInstrumentationConfig,
  AICallRecord,
  AIProvider,
  AITokenUsage,
  ProviderMatcher,
} from "./types";
import { openaiMatcher } from "./providers/openai";
import { anthropicMatcher } from "./providers/anthropic";
import { genericMatcher, bodyLooksLikeAI } from "./providers/generic";
import { computeCost } from "./cost";
import { PROVIDER_HOSTS } from "./cost-table";
import { readSSEStream, isStreamDone } from "./sse";
import { attachRecordToSpan, recordToLogAttributes } from "./span-attributes";

const MATCHERS: ProviderMatcher[] = [openaiMatcher, anthropicMatcher, genericMatcher];

/**
 * Cache of synthetic matchers for catalog-detected providers.
 * Each one reuses the OpenAI parser (since all catalog providers are
 * OpenAI-compatible) but stamps the correct provider name.
 */
const catalogMatcherCache = new Map<string, ProviderMatcher>();

function getCatalogMatcher(providerId: string): ProviderMatcher {
  let m = catalogMatcherCache.get(providerId);
  if (!m) {
    m = {
      ...openaiMatcher,
      name: providerId,
      match: () => false, // never claims by itself — findMatcher routes explicitly
    };
    catalogMatcherCache.set(providerId, m);
  }
  return m;
}

/**
 * Typed loosely to avoid coupling to a specific DOM lib version.
 */
type FetchLike = typeof fetch;

const FLARELOG_WRAPPED = Symbol.for("flarelog.fetchWrapped");

/**
 * The "real" fetch that passthrough calls are routed to.
 * Captured at module load — before any user code can patch it.
 * Tests override this via `__setPassthroughFetch`.
 */
let passthroughFetch: FetchLike = globalThis.fetch as FetchLike;

/**
 * The active interceptor. When null, the inert wrapper passes through.
 * When set (by `instrumentFetch`), all calls route through it.
 */
let activeInterceptor: FetchLike | null = null;

/**
 * The inert wrapper installed at module import time.
 *
 * Non-async on purpose: returning the inner Promise directly avoids
 * allocating an extra microtask. V8 inlines this after warmup because
 * it's monomorphic (always calls the same target).
 *
 * The `FLARELOG_WRAPPED` symbol prevents double-wrapping if this module
 * is imported multiple times (e.g. via different module resolution paths).
 */
const inertWrapper: FetchLike = function (input, init) {
  const impl = activeInterceptor ?? passthroughFetch;
  return impl.call(undefined, input, init);
} as FetchLike;

Object.defineProperty(inertWrapper, FLARELOG_WRAPPED, { value: true });

/**
 * Install the inert wrapper on `globalThis.fetch` at module import time.
 * Idempotent — won't double-wrap if already wrapped.
 */
if (
  typeof globalThis.fetch === "function" &&
  !((globalThis.fetch as unknown as Record<symbol, unknown>)[FLARELOG_WRAPPED])
) {
  try {
    Object.defineProperty(globalThis, "fetch", {
      value: inertWrapper,
      writable: true,
      configurable: true,
    });
  } catch {
    // Non-writable fetch — bail silently. Edge runtime, sandboxed env, etc.
  }
}

/**
 * Activate AI call interception.
 *
 * Sets `activeInterceptor` so the inert wrapper begins routing through
 * the instrumented path. Idempotent — calling twice is a no-op.
 *
 * @returns a cleanup function that deactivates interception.
 */
export function instrumentFetch(
  logger: FlareLog,
  config: AIInstrumentationConfig = {}
): () => void {
  if (activeInterceptor) {
    return () => {};
  }

  const effectiveConfig: Required<
    Pick<AIInstrumentationConfig, "autoFetch" | "propagateTrace" | "captureSamples" | "maxPromptSampleChars" | "sampleRate" | "costMultiplier">
  > = {
    autoFetch: config.autoFetch ?? true,
    propagateTrace: config.propagateTrace ?? true,
    captureSamples: config.captureSamples ?? false,
    maxPromptSampleChars: config.maxPromptSampleChars ?? 500,
    sampleRate: config.sampleRate ?? 1,
    costMultiplier: config.costMultiplier ?? 1,
  };

  const patchedFetch: FetchLike = async (input, init) => {
    let urlStr: string;
    let method: string;
    try {
      if (input instanceof Request) {
        urlStr = input.url;
        method = (init?.method ?? input.method) ?? "GET";
      } else {
        urlStr = String(input);
        method = (init?.method ?? "GET") ?? "GET";
      }
    } catch {
      return passthroughFetch(input, init);
    }

    if (config.shouldInstrument && !config.shouldInstrument(urlStr, method)) {
      return passthroughFetch(input, init);
    }

    const matcher = findMatcher(urlStr, method, config.extraProviderHosts);

    let bodyForMatching: unknown = undefined;
    if (!matcher && method.toUpperCase() === "POST") {
      try {
        bodyForMatching = await peekRequestBody(input, init);
        if (bodyLooksLikeAI(bodyForMatching)) {
          const generic = MATCHERS.find((m) => m.name === "generic")!;
          return instrumentedCall(logger, config, effectiveConfig, generic, urlStr, method, input, init, bodyForMatching);
        }
      } catch {
        return passthroughFetch(input, init);
      }
    }

    if (!matcher) {
      return passthroughFetch(input, init);
    }

    return instrumentedCall(
      logger,
      config,
      effectiveConfig,
      matcher,
      urlStr,
      method,
      input,
      init,
      bodyForMatching
    );
  };

  activeInterceptor = patchedFetch;
  return () => uninstrumentFetch();
}

/**
 * Deactivate AI call interception.
 *
 * Sets `activeInterceptor` back to null. The inert wrapper reverts to
 * passthrough mode. Does NOT remove the wrapper itself — clients that
 * captured it at construction time still call through it, but with
 * zero interception overhead.
 */
export function uninstrumentFetch(): void {
  activeInterceptor = null;
}

/**
 * Test helper: override the passthrough fetch for test isolation.
 *
 * In production, `passthroughFetch` is the native/undici fetch captured
 * at module load. Tests need to replace it with a mock without touching
 * `globalThis.fetch` directly (which is now our inert wrapper).
 *
 * @internal
 */
export function __setPassthroughFetch(fn: FetchLike): void {
  passthroughFetch = fn;
}

/**
 * Test helper: restore the original passthrough fetch.
 *
 * @internal
 */
export function __resetInterceptorState(): void {
  activeInterceptor = null;
  passthroughFetch = globalThis.fetch as FetchLike;
}

/**
 * Find a provider matcher for this URL.
 */
function findMatcher(
  url: string,
  method: string,
  extras?: AIInstrumentationConfig["extraProviderHosts"]
): ProviderMatcher | undefined {
  // First check user-supplied extras — they take precedence.
  if (extras) {
    try {
      const host = new URL(url).host.toLowerCase();
      for (const e of extras) {
        const matches =
          typeof e.pattern === "string"
            ? host.includes(e.pattern.toLowerCase())
            : e.pattern.test(host);
        if (matches) {
          const m = MATCHERS.find((x) => x.name === e.provider);
          if (m) return m;
        }
      }
    } catch {
      // URL parse failed — fall through to built-in matchers.
    }
  }

  // Then built-in matchers (OpenAI, Anthropic).
  for (const m of MATCHERS) {
    if (m.name === "generic") continue;
    if (m.match(url, method)) return m;
  }

  // Then catalog auto-detection via PROVIDER_HOSTS hostname map.
  try {
    const host = new URL(url).host.toLowerCase();
    const providerId = PROVIDER_HOSTS[host] ?? PROVIDER_HOSTS[host.split(":")[0]];
    if (providerId) {
      return getCatalogMatcher(providerId);
    }
  } catch {
    // URL parse failed — fall through.
  }

  return undefined;
}

/**
 * Read the request body for matching — without consuming it.
 *
 * Returns the parsed JSON body if the request is a JSON POST, or undefined.
 * The body is re-streamed into a fresh Request so the downstream fetch
 * still receives it intact.
 *
 * This is the trickiest part of the interceptor: Request bodies can only
 * be read once, so we have to clone-and-replace carefully.
 */
async function peekRequestBody(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<unknown> {
  // If init.body is a string, we can read it directly without cloning.
  if (init?.body && typeof init.body === "string") {
    try {
      return JSON.parse(init.body);
    } catch {
      return undefined;
    }
  }

  // If init.body is an object (some HTTP libs allow this), use it.
  if (init?.body && typeof init.body === "object" && !(init.body instanceof ReadableStream) && !(init.body instanceof Blob) && !(init.body instanceof FormData) && !(init.body instanceof URLSearchParams) && !(init.body instanceof ArrayBuffer)) {
    return init.body;
  }

  // If input is a Request, clone it and read the body from the clone.
  if (input instanceof Request) {
    try {
      const clone = input.clone();
      const text = await clone.text();
      if (!text) return undefined;
      try {
        return JSON.parse(text);
      } catch {
        return undefined;
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Perform an instrumented AI call.
 *
 * This is the meat of the interceptor: clone the request, inject the
 * traceparent header, fire the fetch, time TTFB, parse the response,
 * extract usage/cost, emit a span + log.
 */
async function instrumentedCall(
  logger: FlareLog,
  config: AIInstrumentationConfig,
  effectiveConfig: Required<
    Pick<AIInstrumentationConfig, "autoFetch" | "propagateTrace" | "captureSamples" | "maxPromptSampleChars" | "sampleRate" | "costMultiplier">
  >,
  matcher: ProviderMatcher,
  urlStr: string,
  _method: string,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  bodyForMatching: unknown
): Promise<Response> {
  // Sampling — independent of logger-level sampling.
  if (effectiveConfig.sampleRate < 1 && Math.random() > effectiveConfig.sampleRate) {
    return passthroughFetch(input, init);
  }

  // Extract model + operation early so we can name the span.
  const body = bodyForMatching ?? (await peekRequestBody(input, init));
  const model = matcher.extractModel?.(body) ?? "unknown";
  const operation = matcher.extractOperation(urlStr);

  // Build the request we'll actually send (with traceparent injected).
  let finalInit = init;
  if (effectiveConfig.propagateTrace) {
    finalInit = injectTraceparent(init, logger);
  }

  // Capture optional prompt sample.
  let promptSample: string | undefined;
  let completionSample: string | undefined;
  if (effectiveConfig.captureSamples && body && typeof body === "object") {
    promptSample = extractPromptSample(body as Record<string, unknown>, effectiveConfig.maxPromptSampleChars);
  }

  const startTime = Date.now();
  const record: AICallRecord = {
    provider: matcher.name as AIProvider,
    model,
    operation,
    tokens: {},
    latency: {},
  };

  // Build the span name. Use OTel GenAI convention:
  //   chat <model>   |   embedding <model>   |   etc.
  const spanName = `${operation} ${model}`;

  // Use logger.startSpan so logs emitted inside the handler get correlated.
  return logger.startSpan(
    spanName,
    async (span) => {
      span.setAttribute("gen_ai.provider.name", matcher.name);
      span.setAttribute("gen_ai.request.model", model);
      span.setAttribute("gen_ai.operation.name", operation);
      span.setAttribute("flarelog.ai.url", urlStr);

      if (promptSample) {
        span.setAttribute("flarelog.ai.prompt_sample", promptSample);
      }

      let response: Response;
      let ttfb: number;

      try {
        // Fire the request through the passthrough fetch (bypasses our interceptor).
        response = await passthroughFetch(input as RequestInfo | URL, finalInit);
        ttfb = Date.now() - startTime;
        record.latency.ttfb = ttfb;
        record.status = response.status;
        record.requestId = extractRequestId(matcher.name, response);

        if (!response.ok) {
          // Error response — try to parse body for error type.
          let errorBody: unknown;
          try {
            errorBody = await response.clone().json();
          } catch {
            try {
              errorBody = await response.clone().text();
            } catch {
              errorBody = undefined;
            }
          }
          const parsed = matcher.parseError?.(response.status, errorBody);
          record.errorType = parsed?.type;
          record.errorMessage = parsed?.message;
          record.latency.total = Date.now() - startTime;

          attachRecordToSpan(span, record);
          span.setStatus({
            code: 2, // SpanStatusCode.ERROR
            message: record.errorMessage ?? `HTTP ${response.status}`,
          });
          span.recordException(new Error(record.errorMessage ?? `HTTP ${response.status}`));

          logger.error(`AI call failed: ${model}`, {
            "flarelog.ai.record": record,
            "flarelog.kind": "ai_call",
            "flarelog.ai.error": true,
          });

          return response;
        }

        // Success — parse usage from response.
        const isStream = response.headers.get("content-type")?.includes("text/event-stream");

        if (isStream) {
          record.streamed = true;
          // processStreamResponse returns a NEW Response with a fresh body
          // (the consumer branch of the tee) and a promise that resolves when
          // the telemetry branch finishes parsing SSE chunks for token usage.
          const { response: streamResponse, done } = processStreamResponse(response, matcher, record);
          response = streamResponse;
          await done;
        } else {
          await processJsonResponse(response, matcher, record, effectiveConfig.maxPromptSampleChars, (cs) => {
            completionSample = cs;
          });
        }

        record.latency.total = Date.now() - startTime;

        // Compute tokens/sec for output if we have it.
        if (record.tokens.output && record.latency.total && record.latency.total > 0) {
          const genTime = record.latency.total - (record.latency.ttfb ?? 0);
          if (genTime > 0) {
            record.latency.tokensPerSecond = (record.tokens.output / genTime) * 1000;
          }
        }

        // Compute cost.
        record.costUsd = computeCost(
          model,
          matcher.name as AIProvider,
          record.tokens,
          operation,
          config.priceOverrides,
          effectiveConfig.costMultiplier
        );

        if (completionSample) {
          span.setAttribute("flarelog.ai.completion_sample", completionSample);
        }

        attachRecordToSpan(span, record);

        // Structured log entry — gives the dashboard full-text search.
logger.info(`AI call: ${model}`, {
          "flarelog.ai.record": record,
          "flarelog.kind": "ai_call",
          ...recordToLogAttributes(record),
        });

        return response;
      } catch (err) {
        record.latency.total = Date.now() - startTime;
        record.errorType = err instanceof Error ? err.name : "Error";
        record.errorMessage = err instanceof Error ? err.message : String(err);

        attachRecordToSpan(span, record);
        span.recordException(err as Error);

logger.error(`AI call exception: ${model}`, {
          "flarelog.ai.record": record,
          "flarelog.kind": "ai_call",
          "flarelog.ai.error": true,
          ...recordToLogAttributes(record),
        });

        throw err;
      }
    },
    {
      kind: 2, // SpanKind.CLIENT
    }
  );
}

/**
 * Process a streaming (SSE) response.
 *
 * Returns a NEW Response that the caller can read normally. Behind the
 * scenes, we've tee'd the original body: one branch feeds the new Response
 * (untouched), the other is consumed by us for telemetry.
 *
 * The telemetry read happens in the background — we don't block the caller
 * from starting to consume the stream. By the time the span ends (in the
 * `finally` of startSpan), telemetry may still be in flight; we rely on the
 * logger's batch processor + end-of-request flush to deliver it.
 *
 * Important: this MUST be called before the caller reads `response.body`.
 * Calling `response.body.getReader()` would lock the body and break the tee.
 */
function processStreamResponse(
  response: Response,
  matcher: ProviderMatcher,
  record: AICallRecord
): { response: Response; done: Promise<void> } {
  if (!response.body) return { response, done: Promise.resolve() };

  // Tee — both branches are independently readable.
  const [consumerBranch, telemetryBranch] = response.body.tee();

  // Build a new Response with the consumer branch as its body.
  // Status, statusText, and headers are copied from the original.
  const newResponse = new Response(consumerBranch, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });

  // Read telemetry from our branch. We return the promise so the caller
  // can await it before emitting the log — this ensures token counts are
  // populated. The consumer's Response is returned immediately regardless.
  const done = (async () => {
    let chunkCount = 0;
    try {
      for await (const event of readSSEStream(telemetryBranch)) {
        chunkCount++;
        if (isStreamDone(event)) continue;
        const parsed = matcher.parseStreamChunk?.(event.data);
        if (!parsed) continue;
        if (parsed.tokens) {
          // Streams often send partial usage that supersedes earlier values.
          // Take the max — works for both OpenAI (final chunk has full usage)
          // and Anthropic (input arrives in message_start, output in message_delta).
          record.tokens = mergeTokens(record.tokens, parsed.tokens);
        }
        if (parsed.toolCalls && parsed.toolCalls.length > 0) {
          record.toolCalls = [...(record.toolCalls ?? []), ...parsed.toolCalls];
        }
      }
    } catch {
      // Stream parse failure — best effort, don't break the consumer.
    }
    record.latency.streamChunks = chunkCount;
  })();

  return { response: newResponse, done };
}

function mergeTokens(prev: AITokenUsage, delta: AITokenUsage): AITokenUsage {
  // OpenAI stream usage is FINAL (not a delta) — overwrite.
  // Anthropic's message_start gives input, message_delta gives output.
  // Strategy: take the max of each field. This works for both providers.
  return {
    input: maxOrUndef(prev.input, delta.input),
    output: maxOrUndef(prev.output, delta.output),
    cachedInput: maxOrUndef(prev.cachedInput, delta.cachedInput),
    reasoning: maxOrUndef(prev.reasoning, delta.reasoning),
    cacheCreationInput: maxOrUndef(prev.cacheCreationInput, delta.cacheCreationInput),
  };
}

function maxOrUndef(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

/**
 * Process a non-streaming (JSON) response — clone, parse, extract usage.
 */
async function processJsonResponse(
  response: Response,
  matcher: ProviderMatcher,
  record: AICallRecord,
  maxSampleChars: number,
  onCompletionSample: (sample: string) => void
): Promise<void> {
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    return;
  }

  const parsed = matcher.parseResponse(body);
  if (parsed.tokens) record.tokens = parsed.tokens;
  if (parsed.toolCalls) record.toolCalls = parsed.toolCalls;
  if (parsed.requestId) record.requestId = parsed.requestId;
  if (parsed.model) record.model = parsed.model; // Use server-returned model name (may have date suffix)

  if (maxSampleChars > 0 && body && typeof body === "object") {
    const sample = extractCompletionSample(body as Record<string, unknown>, maxSampleChars);
    if (sample) onCompletionSample(sample);
  }
}

/**
 * Extract the request ID from response headers.
 *
 * OpenAI: `x-request-id` (lowercase header)
 * Anthropic: `request-id` (lowercase header)
 */
function extractRequestId(provider: string, response: Response): string | undefined {
  if (provider === "openai") {
    return response.headers.get("x-request-id") ?? undefined;
  }
  if (provider === "anthropic") {
    return response.headers.get("request-id") ?? undefined;
  }
  return response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? undefined;
}

/**
 * Inject the W3C traceparent header into the outgoing request.
 *
 * Uses the logger's `injectTraceContext` method, which walks the active
 * OTel context and writes the `traceparent` (and `tracestate`) headers.
 */
function injectTraceparent(init: RequestInit | undefined, logger: FlareLog): RequestInit | undefined {
  if (!init) {
    // Create a new init with just the trace headers.
    const headers = new Headers();
    logger.injectTraceContext(headers);
    return { headers };
  }

  // Clone init (shallow) so we don't mutate the caller's object.
  const newInit: RequestInit = { ...init };

  if (init.headers instanceof Headers) {
    const headers = new Headers(init.headers);
    logger.injectTraceContext(headers);
    newInit.headers = headers;
  } else if (init.headers && typeof init.headers === "object") {
    const headers = new Headers(init.headers as Record<string, string>);
    logger.injectTraceContext(headers);
    newInit.headers = headers;
  } else if (typeof init.headers === "string") {
    // raw string headers — convert to Headers
    const headers = new Headers();
    logger.injectTraceContext(headers);
    // Preserve the raw string by appending — best effort.
    headers.append("x-original-headers", init.headers);
    newInit.headers = headers;
  } else {
    const headers = new Headers();
    logger.injectTraceContext(headers);
    newInit.headers = headers;
  }

  return newInit;
}

/**
 * Extract a truncated prompt sample from a request body (for the
 * `flarelog.ai.prompt_sample` span attribute).
 *
 * Looks for `messages` (OpenAI/Anthropic) or `prompt` (legacy completions).
 * Returns the first user message content, truncated.
 */
function extractPromptSample(body: Record<string, unknown>, maxChars: number): string | undefined {
  if (Array.isArray(body.messages)) {
    for (const m of body.messages as Array<Record<string, unknown>>) {
      if (m.role === "user") {
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
        return truncate(content, maxChars);
      }
    }
  }
  if (typeof body.prompt === "string") {
    return truncate(body.prompt, maxChars);
  }
  if (typeof body.input === "string") {
    return truncate(body.input, maxChars);
  }
  return undefined;
}

/**
 * Extract a truncated completion sample from a response body.
 */
function extractCompletionSample(body: Record<string, unknown>, maxChars: number): string | undefined {
  // OpenAI: choices[0].message.content
  if (Array.isArray(body.choices)) {
    const first = body.choices[0] as Record<string, unknown> | undefined;
    if (first?.message && typeof first.message === "object") {
      const msg = first.message as Record<string, unknown>;
      if (typeof msg.content === "string") return truncate(msg.content, maxChars);
    }
  }
  // Anthropic: content[0].text (where type === "text")
  if (Array.isArray(body.content)) {
    for (const block of body.content as Array<Record<string, unknown>>) {
      if (block.type === "text" && typeof block.text === "string") {
        return truncate(block.text, maxChars);
      }
    }
  }
  // Embeddings: { data: [{ embedding: number[] }] } — no sample to capture.
  return undefined;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}
