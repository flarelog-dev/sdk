/**
 * Example: Node.js / Next.js server route with OpenAI + Anthropic,
 * using the Vercel AI SDK and explicit wrap().
 */

import { flarelog } from "@flarelog/sdk";
import { flarelogAI, withFlarelog, wrap } from "@flarelog/sdk/ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, streamText } from "ai";

// Initialize once at module load.
const logger = flarelog({
  apiKey: process.env.FLARELOG_API_KEY,
});

flarelogAI(logger, {
  // Capture OpenAI-compatible gateways (Together, Groq, etc.)
  extraProviderHosts: [
    { pattern: "api.together.xyz", provider: "openai" },
    { pattern: "api.groq.com", provider: "openai" },
  ],
});

// ---------------------------------------------------------------------------
// Example 1: Vercel AI SDK with auto-instrumentation via fetch()
// (works because @ai-sdk/openai calls fetch() under the hood)
// ---------------------------------------------------------------------------

export async function generateWithOpenAI(prompt: string): Promise<string> {
  const result = await generateText({
    model: openai("gpt-4o"),
    prompt,
  });

  // Usage is automatically captured by the fetch interceptor.
  // But the Vercel AI SDK also exposes usage on the result — we can
  // double-check by wrapping explicitly:
  return result.text;
}

// ---------------------------------------------------------------------------
// Example 2: Vercel AI SDK with explicit wrap() for per-call tags
// ---------------------------------------------------------------------------

export async function generateForCustomer(
  prompt: string,
  customerId: string
): Promise<string> {
  const result = await withFlarelog(
    generateText({
      model: anthropic("claude-3-5-sonnet"),
      prompt,
    }),
    {
      logger,
      tags: {
        customer: customerId,
        feature: "support-bot",
      },
    }
  );

  return result.text;
}

// ---------------------------------------------------------------------------
// Example 3: Streaming with the Vercel AI SDK
// ---------------------------------------------------------------------------

export async function streamChat(prompt: string): Promise<ReadableStream> {
  const result = await streamText({
    model: openai("gpt-4o-mini"),
    prompt,
  });

  // streamText returns immediately — the stream is consumed by the caller.
  // The fetch interceptor captures usage from the final SSE chunk in the
  // background, after the stream completes.
  return result.toReadableStream();
}

// ---------------------------------------------------------------------------
// Example 4: Explicit wrap() around any AI SDK (not just Vercel's)
// ---------------------------------------------------------------------------

export async function callCustomAgent(input: string): Promise<unknown> {
  // wrap() works with any function that returns a Promise — it tries to
  // extract usage from the result if it looks like an AI response.
  return wrap(
    async () => {
      const response = await fetch("https://my-internal-agent.example.com/run", {
        method: "POST",
        body: JSON.stringify({ input, model: "my-agent-v1" }),
      });
      return response.json();
    },
    {
      logger,
      model: "my-agent-v1",
      provider: "generic",
      operation: "chat",
      tags: { agent: "internal" },
    }
  );
}
