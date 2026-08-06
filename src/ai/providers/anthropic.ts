/**
 * Anthropic provider matcher.
 *
 * Recognizes calls to:
 *   - api.anthropic.com/v1/messages        (chat / streaming)
 *   - api.anthropic.com/v1/messages/batches (async batch — count once per message)
 *
 * Anthropic's API differs from OpenAI's in several ways:
 * - Token usage lives in `usage` with `input_tokens`, `output_tokens`,
 *   `cache_read_input_tokens`, `cache_creation_input_tokens`.
 * - Stream events are typed (`message_start`, `content_block_delta`,
 *   `message_delta`, `message_stop`). Token counts arrive in
 *   `message_delta` events.
 * - Tool calls live in `content` blocks of type `tool_use`, not in a
 *   separate `tool_calls` array.
 */

import type { ProviderMatcher, AITokenUsage, AIToolCall } from "../types";

const ANTHROPIC_HOSTS = ["api.anthropic.com"];

export const anthropicMatcher: ProviderMatcher = {
  name: "anthropic",

  match(url, _method) {
    try {
      const u = new URL(url);
      const host = u.host.toLowerCase();
      return ANTHROPIC_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
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
      if (path.includes("/messages")) return "chat";
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

    if (b.usage && typeof b.usage === "object") {
      const u = b.usage as Record<string, unknown>;
      const tokens: AITokenUsage = {};
      if (typeof u.input_tokens === "number") tokens.input = u.input_tokens;
      if (typeof u.output_tokens === "number") tokens.output = u.output_tokens;
      if (typeof u.cache_read_input_tokens === "number") tokens.cachedInput = u.cache_read_input_tokens;
      if (typeof u.cache_creation_input_tokens === "number") tokens.cacheCreationInput = u.cache_creation_input_tokens;
      result.tokens = tokens;
    }

    // Anthropic content blocks: array of { type: "text"|"tool_use"|"thinking", ... }
    if (Array.isArray(b.content)) {
      const toolCalls: AIToolCall[] = [];
      for (const block of b.content as Array<Record<string, unknown>>) {
        if (block.type === "tool_use") {
          const args = typeof block.input === "string" ? block.input : JSON.stringify(block.input ?? "");
          toolCalls.push({
            id: typeof block.id === "string" ? block.id : undefined,
            name: typeof block.name === "string" ? block.name : "unknown",
            argumentLength: args.length,
            argumentTokens: Math.ceil(args.length / 4),
          });
        }
      }
      if (toolCalls.length > 0) result.toolCalls = toolCalls;
    }

    return result;
  },

  parseStreamChunk(chunk) {
    if (!chunk) return undefined;

    try {
      const json = JSON.parse(chunk);
      if (!json || typeof json !== "object") return undefined;
      const evt = json as Record<string, unknown>;

      // Anthropic stream events carry a "type" field.
      switch (evt.type) {
        case "message_start": {
          // message.message.usage often contains input_tokens here.
          const msg = evt.message as Record<string, unknown> | undefined;
          if (msg?.usage && typeof msg.usage === "object") {
            const u = msg.usage as Record<string, unknown>;
            const tokens: AITokenUsage = {};
            if (typeof u.input_tokens === "number") tokens.input = u.input_tokens;
            if (typeof u.cache_read_input_tokens === "number") tokens.cachedInput = u.cache_read_input_tokens;
            if (typeof u.cache_creation_input_tokens === "number") tokens.cacheCreationInput = u.cache_creation_input_tokens;
            return { tokens };
          }
          return undefined;
        }
        case "message_delta": {
          // Final usage (output_tokens) lives here.
          if (evt.usage && typeof evt.usage === "object") {
            const u = evt.usage as Record<string, unknown>;
            const tokens: AITokenUsage = {};
            if (typeof u.output_tokens === "number") tokens.output = u.output_tokens;
            return { tokens, done: true };
          }
          return { done: true };
        }
        case "message_stop":
          return { done: true };
        default:
          return undefined;
      }
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
    if (status === 429) return { type: "rate_limit_error", message: "Rate limit exceeded" };
    if (status === 401) return { type: "authentication_error", message: "Invalid API key" };
    if (status === 529) return { type: "overloaded_error", message: "Anthropic API overloaded" };
    return undefined;
  },
};
