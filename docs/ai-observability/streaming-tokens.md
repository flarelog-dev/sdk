# Streaming & Token Usage

> How the SDK captures token counts for streaming responses — and the one provider setting that matters.

## Why streaming token capture needs care

A streamed response has no single JSON body with a `usage` object. Providers emit usage differently, and FlareLog's interceptor reads the **SSE chunks** on a separate branch of the stream (via `body.tee()`) to reconstruct token counts as chunks arrive.

The result: **token counts are populated before the AI call log is emitted**, so your dashboard never shows `0 / 0 tok` for a streamed call.

## OpenAI / OpenAI-compatible gateways

OpenAI **only sends usage when you ask for it**. If you stream without this option, the final SSE chunk contains `[DONE]` and nothing else — and token counts will be empty.

**Set `stream_options: { include_usage: true }` on every streaming request:**

```ts
await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  body: JSON.stringify({
    model: "gpt-4o",
    stream: true,
    stream_options: { include_usage: true }, // ← required for token capture
    messages: [{ role: "user", content: "Hello" }],
  }),
});
```

When enabled, OpenAI appends a final chunk carrying `usage` (`prompt_tokens`, `completion_tokens`, plus cached/reasoning token details). The SDK reads it and merges it into the record.

> **OpenAI SDK note:** the `openai` npm package sends `stream_options.include_usage` automatically when you pass `stream: true` — no extra work needed there.

## Anthropic

Anthropic streams usage in-band without any extra option:

- `input_tokens` (and cache read/creation counts) arrive in the `message_start` event
- `output_tokens` arrive in the `message_delta` event

The SDK merges both. Streaming "just works" — no configuration required.

## Cloudflare Workers AI

Workers AI returns usage inline in the resolved result object (`{ response, usage: { prompt_tokens, completion_tokens } }`), so the `wrapWorkersAI` wrapper captures tokens the same way for streaming and non-streaming calls.

## Vercel AI SDK

`withFlarelog()` reads `result.usage` (`promptTokens` / `completionTokens`) off the resolved `generateText`/`streamText` result, so token capture works regardless of the underlying provider's streaming behavior.

## What if tokens are still missing?

Check, in order:

1. **OpenAI streaming** — is `stream_options: { include_usage: true }` set? Without it, no `usage` chunk exists to read. Verify the raw response ends with a usage chunk:
   ```bash
   curl -N https://api.openai.com/v1/chat/completions \
     -H "Authorization: Bearer $OPENAI_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model":"gpt-4o","stream":true,"stream_options":{"include_usage":true},"messages":[{"role":"user","content":"hi"}]}' \
     | tail -1
   ```
   The last line should be a JSON object with a `usage` field, not `data: [DONE]`.

2. **OpenAI-compatible gateways** — most (OpenRouter, Groq, Together, etc.) support `stream_options.include_usage` the same way. If the gateway strips it, tokens will be empty; fall back to `captureSamples` or log usage manually.

3. **Latest SDK** — streaming token capture landed in **v2.8.2**. Make sure you're not on an older version:
   ```bash
   npm ls @flarelog/sdk
   ```

4. **Check the dashboard** — the AI dashboard reads `flarelog.ai.*` attributes. If the record shows `"tokens": {}` in the raw log metadata, the provider didn't emit usage; if the dashboard shows 0 despite the metadata having tokens, it's a dashboard bug — report it.
