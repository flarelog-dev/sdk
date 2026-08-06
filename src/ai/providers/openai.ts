/**
 * OpenAI provider matcher.
 *
 * Recognizes calls to:
 *   - api.openai.com/v1/chat/completions       (chat)
 *   - api.openai.com/v1/completions            (legacy completions)
 *   - api.openai.com/v1/embeddings             (embedding)
 *   - api.openai.com/v1/images/generations     (image)
 *   - api.openai.com/v1/audio/*                (audio)
 *   - api.openai.com/v1/moderations            (moderation)
 *   - api.openai.com/v1/responses              (new responses API)
 *
 * Also handles OpenAI-compatible gateways configured via
 * `extraProviderHosts` — Together, Groq, Anyscale, OpenRouter, etc.
 */

import type { ProviderMatcher, AITokenUsage, AIToolCall } from "../types";

const OPENAI_HOSTS = ["api.openai.com", "openai.com"];

export const openaiMatcher: ProviderMatcher = {
  name: "openai",

  match(url, _method) {
    try {
      const u = new URL(url);
      const host = u.host.toLowerCase();
      return OPENAI_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    } catch {
      return false;
    }
  },

  extractModel(body) {
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      if (typeof b.model === "string") return b.model;
    }
    return undefined;
  },

  extractOperation(url) {
    try {
      const path = new URL(url).pathname.toLowerCase();
      if (path.includes("/chat/completions")) return "chat";
      if (path.includes("/completions") && !path.includes("/chat/")) return "completion";
      if (path.includes("/embeddings")) return "embedding";
      if (path.includes("/images/")) return "image";
      if (path.includes("/audio/")) return "audio";
      if (path.includes("/moderations")) return "moderation";
      if (path.includes("/responses")) return "chat";
      return "unknown";
    } catch {
      return "unknown";
    }
  },

  parseResponse(body) {
    const result: {
      tokens?: AITokenUsage;
      toolCalls?: AIToolCall[];
      requestId?: string;
      model?: string;
    } = {};

    if (!body || typeof body !== "object") return result;
    const b = body as Record<string, unknown>;

    if (typeof b.model === "string") result.model = b.model;

    // usage object: { prompt_tokens, completion_tokens, total_tokens,
    //   prompt_tokens_details: { cached_tokens }, completion_tokens_details: { reasoning_tokens } }
    if (b.usage && typeof b.usage === "object") {
      const u = b.usage as Record<string, unknown>;
      const tokens: AITokenUsage = {};
      if (typeof u.prompt_tokens === "number") tokens.input = u.prompt_tokens;
      if (typeof u.completion_tokens === "number") tokens.output = u.completion_tokens;

      if (u.prompt_tokens_details && typeof u.prompt_tokens_details === "object") {
        const pd = u.prompt_tokens_details as Record<string, unknown>;
        if (typeof pd.cached_tokens === "number") tokens.cachedInput = pd.cached_tokens;
      }
      if (u.completion_tokens_details && typeof u.completion_tokens_details === "object") {
        const cd = u.completion_tokens_details as Record<string, unknown>;
        if (typeof cd.reasoning_tokens === "number") tokens.reasoning = cd.reasoning_tokens;
      }
      result.tokens = tokens;
    }

    // tool_calls — appear inside choices[0].message.tool_calls
    if (b.choices && Array.isArray(b.choices) && b.choices.length > 0) {
      const first = b.choices[0] as Record<string, unknown>;
      if (first.message && typeof first.message === "object") {
        const msg = first.message as Record<string, unknown>;
        if (Array.isArray(msg.tool_calls)) {
          result.toolCalls = (msg.tool_calls as Array<Record<string, unknown>>).map((tc) => {
            const fn = tc.function as Record<string, unknown> | undefined;
            const args = typeof fn?.arguments === "string" ? fn.arguments : "";
            return {
              id: typeof tc.id === "string" ? tc.id : undefined,
              name: typeof fn?.name === "string" ? fn.name : "unknown",
              argumentLength: args.length,
              argumentTokens: Math.ceil(args.length / 4),
            };
          });
        }
      }
    }

    return result;
  },

  parseStreamChunk(chunk) {
    if (!chunk || chunk.trim() === "[DONE]") return { done: true };

    try {
      const json = JSON.parse(chunk);
      const result: { tokens?: AITokenUsage; toolCalls?: AIToolCall[]; done?: boolean } = {};

      // OpenAI sends usage in the final chunk when stream_options.include_usage is true
      if (json.usage && typeof json.usage === "object") {
        const u = json.usage as Record<string, unknown>;
        const tokens: AITokenUsage = {};
        if (typeof u.prompt_tokens === "number") tokens.input = u.prompt_tokens;
        if (typeof u.completion_tokens === "number") tokens.output = u.completion_tokens;

        if (u.prompt_tokens_details && typeof u.prompt_tokens_details === "object") {
          const pd = u.prompt_tokens_details as Record<string, unknown>;
          if (typeof pd.cached_tokens === "number") tokens.cachedInput = pd.cached_tokens;
        }
        if (u.completion_tokens_details && typeof u.completion_tokens_details === "object") {
          const cd = u.completion_tokens_details as Record<string, unknown>;
          if (typeof cd.reasoning_tokens === "number") tokens.reasoning = cd.reasoning_tokens;
        }
        result.tokens = tokens;
        result.done = true;
      }

      // Tool calls can also appear in stream chunks (delta.tool_calls)
      if (Array.isArray(json.choices) && json.choices.length > 0) {
        const first = json.choices[0] as Record<string, unknown>;
        if (first.delta && typeof first.delta === "object") {
          const delta = first.delta as Record<string, unknown>;
          if (Array.isArray(delta.tool_calls)) {
            result.toolCalls = (delta.tool_calls as Array<Record<string, unknown>>).map((tc) => {
              const fn = tc.function as Record<string, unknown> | undefined;
              const args = typeof fn?.arguments === "string" ? fn.arguments : "";
              return {
                id: typeof tc.id === "string" ? tc.id : undefined,
                name: typeof fn?.name === "string" ? fn.name : "unknown",
                argumentLength: args.length,
                argumentTokens: Math.ceil(args.length / 4),
              };
            });
          }
        }
      }

      return result;
    } catch {
      return undefined;
    }
  },

  parseError(status, body) {
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      if (b.error && typeof b.error === "object") {
        const err = b.error as Record<string, unknown>;
        const result: { type?: string; message?: string } = {};
        if (typeof err.type === "string") result.type = err.type;
        if (typeof err.message === "string") result.message = err.message;
        return result;
      }
    }
    if (status === 429) return { type: "rate_limit_exceeded", message: "Rate limit exceeded" };
    if (status === 401) return { type: "authentication_error", message: "Invalid API key" };
    if (status === 413) return { type: "context_length_exceeded", message: "Request too large" };
    return undefined;
  },
};

/**
 * Helper to recognize OpenAI-compatible gateways. The user adds entries
 * like `{ pattern: "api.together.xyz", provider: "openai" }` to
 * `AIInstrumentationConfig.extraProviderHosts` and the fetch interceptor
 * routes them through the OpenAI parser.
 *
 * This is exported so the OpenAI matcher can be reused for them.
 */
export function isOpenAICompatibleHost(
  url: string,
  extras?: Array<{ pattern: string | RegExp; provider: string }>
): boolean {
  if (openaiMatcher.match(url, "POST")) return true;
  if (!extras) return false;
  try {
    const host = new URL(url).host.toLowerCase();
    return extras.some((e) => {
      if (e.provider !== "openai") return false;
      if (typeof e.pattern === "string") return host.includes(e.pattern.toLowerCase());
      return e.pattern.test(host);
    });
  } catch {
    return false;
  }
}
