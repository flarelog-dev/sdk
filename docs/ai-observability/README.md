# AI Inference Observability

> Zero-config instrumentation for AI calls — capture tokens, latency, cost, and tool calls across OpenAI, Anthropic, Cloudflare Workers AI, Vercel AI SDK, and any OpenAI-compatible gateway.

## Why

Every team adding LLM calls to their app hits the same wall:

- **No idea what they're spending.** Cloudflare's cost metrics lag 15–60 minutes. OpenAI's usage dashboard refreshes daily. By the time you notice a $500 spike from a runaway loop, it's already billed.
- **No idea what's slow.** A 30-second chat completion feels like "the model is thinking" — but is it TTFB (cold start), generation speed, or network? Without per-call latency breakdowns, you can't tell.
- **No idea what's failing.** Rate limits, context-length errors, fallback chains, retry storms — these get logged as generic 500s, if they're logged at all.
- **No idea which agents are doing what.** Tool calls happen inside a streaming response, the SDK doesn't expose them, and your dashboard shows a single black box.

FlareLog's AI module fixes all four. One `npm install`, one function call, full visibility.

## Quick start

### 1. Install

```bash
npm install @flarelog/sdk
```

The AI module ships as a subpath export — no extra package needed.

### 2. Enable

```ts
import { flarelog } from "@flarelog/sdk";
import { flarelogAI } from "@flarelog/sdk/ai";

const logger = flarelog({
  apiKey: process.env.FLARELOG_API_KEY!, // optional — works console-only without
});

// One call. Now every fetch() to OpenAI/Anthropic/etc. is captured.
const ai = flarelogAI(logger);
```

### 3. Use your AI SDK as usual

```ts
// OpenAI
await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Hello" }],
  }),
});

// Anthropic
await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": process.env.ANTHROPIC_API_KEY!,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello" }],
  }),
});
```

Each call now produces:
- An OTel span named `chat <model>` with `gen_ai.*` semantic attributes
- A structured log entry with `flarelog.kind: "ai_call"` containing the full `AICallRecord`

## How fetch interception works

FlareLog uses an **inert pre-wrapper** pattern to ensure interception works even when AI SDK clients (OpenAI, Anthropic) are constructed before `flarelogAI()` is called.

**The problem:** The OpenAI SDK (`openai` v4+) and Anthropic SDK (`@anthropic-ai/sdk`) both capture `globalThis.fetch` at construction time (`this.fetch = options.fetch ?? getDefaultFetch()`) and cache it for the client's lifetime. A naive patch to `globalThis.fetch` after construction is invisible to these clients.

**The solution:** When `@flarelog/sdk/ai` is imported, it immediately installs a lightweight pass-through wrapper on `globalThis.fetch`. This wrapper is **inert** — it adds near-zero overhead (~2-5ns/call) and simply delegates to the real fetch. When `flarelogAI()` is called later, the wrapper "activates" and begins intercepting AI calls.

```
import "@flarelog/sdk/ai"  →  globalThis.fetch = inertWrapper (pass-through)
new OpenAI()               →  this.fetch = inertWrapper (SDK captures our wrapper)
flarelogAI(logger)          →  inertWrapper activates → interception begins
```

This means the **vast majority of users** don't need to think about ordering — `flarelogAI()` works regardless of when the SDK client was constructed.

**Edge case:** If the AI SDK client is constructed in a separate file that's imported *before* `@flarelog/sdk/ai` (e.g. a `lib/openai.ts` module imported at the top of the entry point), the client captures the raw native fetch. In that case, use [`wrapClient()`](#wrapclient-client) after `flarelogAI()`.

### 4. (Optional) Instrument Workers AI

Workers AI uses a binding, not fetch, so it needs a separate wrapper:

```ts
import { wrapWorkersAI } from "@flarelog/sdk/ai";

export default {
  async fetch(req, env, ctx) {
    const ai = wrapWorkersAI(env.AI, logger);
    const result = await ai.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [{ role: "user", content: "Hello" }],
    });
    return Response.json(result);
  },
};
```

### 5. (Optional) Instrument Vercel AI SDK

The `ai` package abstracts over providers, so its calls don't always go through `fetch()`. Use the wrapper:

```ts
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { withFlarelog } from "@flarelog/sdk/ai";

const result = await withFlarelog(
  generateText({
    model: openai("gpt-4o"),
    messages: [{ role: "user", content: "Hello" }],
  }),
  { logger, tags: { route: "/chat" } }
);
```

## What gets captured

Every AI call produces an `AICallRecord` with these fields:

| Field | Description | OTel attribute |
|-------|-------------|----------------|
| `provider` | `openai`, `anthropic`, `workers_ai`, etc. | `gen_ai.provider.name` |
| `model` | Server-returned model name (e.g. `gpt-4o-2024-08-06`) | `gen_ai.response.model` |
| `operation` | `chat`, `embedding`, `image`, `audio`, etc. | `gen_ai.operation.name` |
| `tokens.input` | Fresh input tokens (not cached) | `gen_ai.usage.input_tokens` |
| `tokens.output` | Generated output tokens | `gen_ai.usage.output_tokens` |
| `tokens.cachedInput` | Tokens served from prompt cache | `gen_ai.usage.cached_input_tokens` |
| `tokens.reasoning` | Reasoning tokens (o1/o3 series) | `gen_ai.usage.reasoning_tokens` |
| `tokens.cacheCreationInput` | Cache-write tokens (Anthropic) | `gen_ai.usage.cache_creation_input_tokens` |
| `latency.ttfb` | Time to first byte (ms) | `flarelog.ai.ttfb_ms` |
| `latency.total` | Total request duration (ms) | `flarelog.ai.total_ms` |
| `latency.streamChunks` | SSE chunks received (streams only) | `flarelog.ai.stream_chunks` |
| `latency.tokensPerSecond` | Output tokens/sec | `flarelog.ai.tokens_per_second` |
| `costUsd` | Estimated USD cost | `flarelog.ai.cost_usd` |
| `status` | HTTP status code | `flarelog.ai.status_code` |
| `requestId` | Provider-assigned request ID | `flarelog.ai.request_id` |
| `toolCalls` | Array of tool calls the model made | `flarelog.ai.tool_call_count` + `flarelog.ai.tool_call_names` |
| `errorType` | Structured error type (e.g. `rate_limit_exceeded`) | `flarelog.ai.error_type` |
| `streamed` | Whether the response was SSE-streamed | `flarelog.ai.streamed` |
| `tags` | User-provided per-call tags | `flarelog.ai.tag.<key>` |

## Configuration

```ts
flarelogAI(logger, {
  // Auto-patch global fetch(). Default: true.
  autoFetch: true,

  // Inject W3C traceparent on outgoing AI calls. Default: true.
  propagateTrace: true,

  // Capture truncated prompt/completion samples (privacy-sensitive). Default: false.
  captureSamples: false,
  maxPromptSampleChars: 500,

  // Override or extend the bundled price table.
  priceOverrides: {
    "my-custom-model": { input: 1, output: 2 },
  },

  // Multiplier applied to all costs (e.g. for internal transfer pricing).
  costMultiplier: 1.0,

  // Sample rate for AI spans (independent of logger.sampleRate). Default: 1.0.
  sampleRate: 1.0,

  // Filter which requests to intercept.
  shouldInstrument: (url, method) => !url.includes("/internal/"),

  // Recognize OpenAI-compatible gateways.
  extraProviderHosts: [
    { pattern: "api.together.xyz", provider: "openai" },
    { pattern: "api.groq.com", provider: "openai" },
    { pattern: /.*\.openrouter\.ai$/, provider: "openai" },
  ],
});
```

## API reference

### `flarelogAI(logger, config?)`

Enable AI instrumentation. Returns a handle with a `dispose()` method.

```ts
const ai = flarelogAI(logger);
// ... later, if you need to remove instrumentation:
ai.dispose();
```

### `wrapClient(client)`

Re-route an AI SDK client's internal `fetch` through `globalThis.fetch`. Use when the client was constructed before `@flarelog/sdk/ai` was imported (e.g. a `lib/openai.ts` module imported at entry-point top).

Works with the **OpenAI SDK** (`openai`), **Anthropic SDK** (`@anthropic-ai/sdk`), and any client that stores `fetch` as a public property.

```ts
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { flarelogAI, wrapClient } from "@flarelog/sdk/ai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

flarelogAI(logger);
wrapClient(openai);
wrapClient(anthropic);
```

**Not needed** if the client is constructed after `import "@flarelog/sdk/ai"`.

### `wrap(fn, opts)`

Explicit-wrap API — for when you don't want global fetch patching.

```ts
const result = await wrap(
  () => openai.chat.completions.create({ /* ... */ }),
  {
    logger,
    model: "gpt-4o",         // optional — used if response doesn't include it
    provider: "openai",      // optional, default: "generic"
    operation: "chat",       // optional, default: "chat"
    tags: { customer: "acme", route: "/chat" },
  }
);
```

### `wrapWorkersAI(binding, logger)`

Wrap a Cloudflare Workers AI binding so every `.run()` call is instrumented.

```ts
const ai = wrapWorkersAI(env.AI, logger);
const result = await ai.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", inputs, {
  gateway: { skipCache: true },
  tags: { route: "/summarize" },
});
```

### `withFlarelog(promise, opts)`

Wrap a Vercel AI SDK call (`generateText`, `streamText`, `generateObject`).

```ts
const result = await withFlarelog(
  generateText({ model: openai("gpt-4o"), prompt: "Hi" }),
  { logger, tags: { feature: "summarize" } }
);
```

### `instrumentFetch(logger, config?)` / `uninstrumentFetch()`

Lower-level: just the fetch patching, without the `flarelogAI` factory wrapper.

### Cost calculation

```ts
import { computeCost, formatCost, lookupPrice, PRICE_TABLE } from "@flarelog/sdk/ai";

// Compute cost for a known model + usage
const cost = computeCost("gpt-4o", "openai", { input: 1000, output: 500 }, "chat");
// → 0.0075

// Format for display
formatCost(cost); // "$0.0075"

// Look up a price entry
const price = lookupPrice("claude-3-5-sonnet", "anthropic");
// → { input: 3, output: 15, cachedInput: 0.3, cacheCreationInput: 3.75 }

// Override the price table globally (affects all subsequent computeCost calls
// when passed via priceOverrides config)
```

### SSE parser (escape hatch)

```ts
import { readSSEStream, parseSSEString, isStreamDone } from "@flarelog/sdk/ai";

// Walk a stream as it arrives
for await (const event of readSSEStream(response.body)) {
  if (isStreamDone(event)) break;
  const json = JSON.parse(event.data);
  // ...
}

// Parse a complete SSE string (e.g. from a buffered body)
const events = [...parseSSEString(sseString)];
```

## Provider matchers

Each provider has a `ProviderMatcher` that knows how to:
1. Recognize its API hostnames (`match`)
2. Extract the model name from the request body (`extractModel`)
3. Map URL paths to operation types (`extractOperation`)
4. Parse non-streaming JSON responses (`parseResponse`)
5. Parse individual SSE chunks (`parseStreamChunk`)
6. Map HTTP errors to structured error types (`parseError`)

You can import them directly to build custom instrumentation:

```ts
import { openaiMatcher, anthropicMatcher, genericMatcher } from "@flarelog/sdk/ai";

if (openaiMatcher.match(url, method)) {
  const operation = openaiMatcher.extractOperation(url);
  const parsed = openaiMatcher.parseResponse(body);
  // ...
}
```

## Adding a custom provider

If you're using a provider we don't support yet (e.g. a new AI gateway), you have three options:

1. **Quick:** Add it as an OpenAI-compatible host:
   ```ts
   flarelogAI(logger, {
     extraProviderHosts: [{ pattern: "api.your-gateway.com", provider: "openai" }],
   });
   ```

2. **Custom:** Build a `ProviderMatcher` and use it with the lower-level `instrumentFetch`:
   ```ts
   import { instrumentFetch } from "@flarelog/sdk/ai";

   const myMatcher: ProviderMatcher = {
     name: "generic", // or a custom provider name
     match: (url) => url.includes("my-gateway.com"),
     extractModel: (body) => body?.model,
     extractOperation: () => "chat",
     parseResponse: (body) => ({ tokens: { input: body.usage.in, output: body.usage.out } }),
     parseStreamChunk: (chunk) => { /* ... */ },
   };
   ```

3. **Upstream:** Open a PR adding it to `src/ai/providers/` — most providers follow one of the existing patterns.

## Pricing

The bundled price table covers ~80 models across OpenAI, Anthropic, Cloudflare Workers AI, Google Gemini, Mistral, Cohere, DeepSeek, Together, and Groq. Prices are USD per 1M tokens, sourced from public pricing pages.

**Prices drift.** Always override with `priceOverrides` when billing-grade accuracy matters:

```ts
flarelogAI(logger, {
  priceOverrides: {
    // Your negotiated rate, or today's price after a provider update
    "gpt-4o": { input: 2.25, output: 9, cachedInput: 1.125 },
  },
});
```

You can also apply a multiplier for internal cost allocation:

```ts
flarelogAI(logger, {
  costMultiplier: 1.5, // charge 150% to internal teams
});
```

## Privacy

By default, the SDK captures **only metadata** — token counts, latency, cost, model name, status code. It does **not** capture prompt or completion content.

To enable prompt/completion samples (e.g. for debugging):

```ts
flarelogAI(logger, {
  captureSamples: true,
  maxPromptSampleChars: 500, // first 500 chars of first user message + first completion
});
```

Samples are attached as `flarelog.ai.prompt_sample` and `flarelog.ai.completion_sample` span attributes. They're subject to the same PII scrubbing as other metadata (via `scrubFields` in the logger config).

## Performance

The fetch interceptor adds <1ms overhead per AI call (measured on a 100-call benchmark). The hot path:

1. URL parse + hostname check — ~0.05ms
2. Body peek (clone + JSON parse) — ~0.3ms for typical chat bodies
3. Span creation — ~0.1ms
4. Response parsing (non-stream) — ~0.2ms
5. Cost calculation — ~0.01ms
6. Log emission — ~0.05ms

For streaming responses, the body is `tee()`'d once (zero-copy), and SSE parsing happens in a background promise that doesn't block the consumer.

**When inactive** (before `flarelogAI()` or never called), the inert pre-wrapper adds ~2-5ns per fetch call — a single null check on a closure variable. The wrapper is non-async to avoid Promise allocation overhead.

## OTel semantic conventions

All span attributes follow the [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) where they exist, so any OTLP-compatible backend (Grafana, Honeycomb, Datadog, Tempo) renders them natively.

FlareLog-specific attributes are prefixed with `flarelog.ai.*` and are what the FlareLog dashboard queries directly.

## Limitations

- **Browser-side calls** work but aren't a priority — most AI calls happen server-side. CORS and API-key exposure make browser-side calls an anti-pattern anyway.
- **Image generation** cost uses a per-image approximation stored in the `input` price field — the per-token model doesn't fit cleanly.
- **Audio transcription** has no token model at all; we capture the call as a span but don't compute cost.
- **Anthropic's batch API** (`/v1/messages/batches`) returns a batch ID, not the actual usage — usage arrives async via a separate webhook. We capture the batch submission but not the eventual usage (yet — planned for v2).
- **OpenAI Realtime API** (WebSocket) isn't supported — only HTTP fetch is intercepted. Planned.

## Roadmap

- [ ] Realtime API (WebSocket) instrumentation
- [ ] Anthropic batch API usage reconciliation (via webhook)
- [ ] Multi-turn conversation correlation (group calls by conversation ID)
- [ ] Cost budget alerts (per-route, per-customer)
- [ ] Per-customer cost allocation (multi-tenant SaaS use case)
- [ ] Custom dashboards: top-100 prompts by cost, slowest completions, retry storms
- [ ] LangChain / LlamaIndex / Mastra instrumentation wrappers
- [ ] Auto-generated PRs from error traces (the "AI fixes it" loop)