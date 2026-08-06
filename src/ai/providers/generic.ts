/**
 * Generic provider matcher — last-resort fallback.
 *
 * Activated when a fetch call has a JSON body containing one of the
 * common AI-request fingerprints (`model`, `messages`, `prompt`, `input`,
 * `stream`) but the host isn't recognized as OpenAI/Anthropic/etc.
 *
 * This catches:
 *   - OpenAI-compatible gateways the user forgot to register
 *   - Self-hosted LLM servers (vLLM, TGI, Ollama, LM Studio)
 *   - New providers we haven't added matchers for yet
 *
 * It doesn't extract token usage (we don't know the schema) but it still
 * records the call as an AI span so the dashboard sees it.
 */

import type { ProviderMatcher } from "../types";

export const genericMatcher: ProviderMatcher = {
  name: "generic",

  // The generic matcher never claims ownership by host — only the fetch
  // interceptor's body-shape fallback should route to it.
  match: () => false,

  extractModel(body) {
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      if (typeof b.model === "string") return b.model;
    }
    return undefined;
  },

  extractOperation(_url) {
    return "unknown";
  },

  parseResponse(body) {
    const result: {
      model?: string;
      tokens?: { input?: number; output?: number };
      toolCalls?: import("../types").AIToolCall[];
      requestId?: string;
    } = {};
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      if (typeof b.model === "string") result.model = b.model;
    }
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      if (b.usage && typeof b.usage === "object") {
        const u = b.usage as Record<string, unknown>;
        const tokens: { input?: number; output?: number } = {};
        if (typeof u.prompt_tokens === "number") tokens.input = u.prompt_tokens;
        else if (typeof u.input_tokens === "number") tokens.input = u.input_tokens;
        if (typeof u.completion_tokens === "number") tokens.output = u.completion_tokens;
        else if (typeof u.output_tokens === "number") tokens.output = u.output_tokens;
        if (tokens.input !== undefined || tokens.output !== undefined) {
          result.tokens = tokens;
        }
      }
    }
    return result;
  },

  parseStreamChunk(_chunk) {
    return undefined;
  },

  parseError(status, _body) {
    if (status === 429) return { type: "rate_limit", message: "Rate limit exceeded" };
    if (status === 401) return { type: "auth_error", message: "Authentication failed" };
    return undefined;
  },
};

/**
 * Returns true if a request body looks like an AI call — used by the fetch
 * interceptor to decide whether to fall back to the generic matcher when
 * the host isn't recognized.
 */
export function bodyLooksLikeAI(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  // Strong signals — model + messages/prompt is unmistakably an LLM call.
  if (typeof b.model === "string") {
    if (Array.isArray(b.messages)) return true;
    if (typeof b.prompt === "string" || typeof b.prompt === "object") return true;
    if (Array.isArray(b.input)) return true; // embeddings
  }
  // Weaker signal — stream:true alone isn't enough.
  return false;
}
