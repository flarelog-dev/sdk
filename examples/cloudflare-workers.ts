/**
 * Example: Cloudflare Workers with OpenAI + Workers AI, fully instrumented.
 *
 * Run with:
 *   npx wrangler deploy
 *
 * Set secrets:
 *   npx wrangler secret put FLARELOG_API_KEY
 *   npx wrangler secret put OPENAI_API_KEY
 *
 * wrangler.toml:
 *   [ai]
 *   binding = "AI"
 */

import { flarelog, workerFetch } from "@flarelog/sdk";
import { flarelogAI, wrapWorkersAI } from "@flarelog/sdk/ai";

// One logger per Worker instance.
const logger = flarelog({
  // api key comes from env binding, not process.env, in Workers
});

// Enable AI instrumentation once at module load.
flarelogAI(logger, {
  // Optional: per-call tags applied to every AI span emitted from this Worker
  // tags: { service: "chat-worker" },
});

export interface Env {
  FLARELOG_API_KEY: string;
  OPENAI_API_KEY: string;
  AI: Ai; // Cloudflare Workers AI binding
}

export default workerFetch(async (request, env, ctx) => {
  const url = new URL(request.url);

  if (url.pathname === "/chat/openai") {
    return handleOpenAIChat(request, env);
  }

  if (url.pathname === "/chat/workers-ai") {
    return handleWorkersAIChat(request, env);
  }

  return new Response("Not found", { status: 404 });
});

async function handleOpenAIChat(request: Request, env: Env): Promise<Response> {
  const { messages } = (await request.json()) as { messages: Array<{ role: string; content: string }> };

  // This fetch is automatically instrumented by flarelogAI().
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      stream: true, // streaming works out of the box
    }),
  });

  // Pass the streaming response through — the caller gets SSE chunks
  // as they arrive, while FlareLog captures usage in the background.
  return new Response(response.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}

async function handleWorkersAIChat(request: Request, env: Env): Promise<Response> {
  const { messages } = (await request.json()) as { messages: Array<{ role: string; content: string }> };

  // Wrap the binding once per request (cheap — just creates a wrapper object).
  const ai = wrapWorkersAI(env.AI, logger);

  const result = await ai.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages,
  }, {
    tags: {
      route: "/chat/workers-ai",
      // Pass any per-call metadata as tags — they show up as
      // flarelog.ai.tag.<key> in the span attributes.
    },
  });

  return Response.json(result);
}
