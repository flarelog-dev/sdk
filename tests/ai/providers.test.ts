/**
 * Tests for provider matchers.
 */
import { describe, it, expect } from "vitest";
import { openaiMatcher } from "../../src/ai/providers/openai";
import { anthropicMatcher } from "../../src/ai/providers/anthropic";
import { genericMatcher, bodyLooksLikeAI } from "../../src/ai/providers/generic";

describe("openaiMatcher", () => {
  describe("match", () => {
    it("matches api.openai.com", () => {
      expect(openaiMatcher.match("https://api.openai.com/v1/chat/completions", "POST")).toBe(true);
    });

    it("matches www.openai.com", () => {
      expect(openaiMatcher.match("https://openai.com/v1/chat/completions", "POST")).toBe(true);
    });

    it("does not match other hosts", () => {
      expect(openaiMatcher.match("https://api.anthropic.com/v1/messages", "POST")).toBe(false);
      expect(openaiMatcher.match("https://api.together.xyz/v1/chat/completions", "POST")).toBe(false);
    });

    it("does not match subdomains of unrelated domains", () => {
      expect(openaiMatcher.match("https://openai.example.com/v1/chat", "POST")).toBe(false);
    });
  });

  describe("extractModel", () => {
    it("extracts model from request body", () => {
      expect(openaiMatcher.extractModel({ model: "gpt-4o" })).toBe("gpt-4o");
    });

    it("returns undefined for body without model", () => {
      expect(openaiMatcher.extractModel({ messages: [] })).toBeUndefined();
    });

    it("returns undefined for non-object body", () => {
      expect(openaiMatcher.extractModel(null)).toBeUndefined();
      expect(openaiMatcher.extractModel("string")).toBeUndefined();
    });
  });

  describe("extractOperation", () => {
    it("detects chat completions", () => {
      expect(openaiMatcher.extractOperation("https://api.openai.com/v1/chat/completions")).toBe("chat");
    });

    it("detects legacy completions", () => {
      expect(openaiMatcher.extractOperation("https://api.openai.com/v1/completions")).toBe("completion");
    });

    it("detects embeddings", () => {
      expect(openaiMatcher.extractOperation("https://api.openai.com/v1/embeddings")).toBe("embedding");
    });

    it("detects images", () => {
      expect(openaiMatcher.extractOperation("https://api.openai.com/v1/images/generations")).toBe("image");
    });

    it("detects audio", () => {
      expect(openaiMatcher.extractOperation("https://api.openai.com/v1/audio/transcriptions")).toBe("audio");
    });

    it("detects moderations", () => {
      expect(openaiMatcher.extractOperation("https://api.openai.com/v1/moderations")).toBe("moderation");
    });

    it("detects responses API as chat", () => {
      expect(openaiMatcher.extractOperation("https://api.openai.com/v1/responses")).toBe("chat");
    });

    it("returns unknown for unrecognized paths", () => {
      expect(openaiMatcher.extractOperation("https://api.openai.com/v1/unknown")).toBe("unknown");
    });
  });

  describe("parseResponse", () => {
    it("extracts basic token usage", () => {
      const body = {
        model: "gpt-4o-2024-08-06",
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };
      const result = openaiMatcher.parseResponse(body);
      expect(result.tokens?.input).toBe(100);
      expect(result.tokens?.output).toBe(50);
      expect(result.model).toBe("gpt-4o-2024-08-06");
    });

    it("extracts cached input tokens", () => {
      const body = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          prompt_tokens_details: { cached_tokens: 80 },
        },
      };
      const result = openaiMatcher.parseResponse(body);
      expect(result.tokens?.cachedInput).toBe(80);
    });

    it("extracts reasoning tokens", () => {
      const body = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          completion_tokens_details: { reasoning_tokens: 200 },
        },
      };
      const result = openaiMatcher.parseResponse(body);
      expect(result.tokens?.reasoning).toBe(200);
    });

    it("extracts tool calls from choices[0].message.tool_calls", () => {
      const body = {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_abc",
                  type: "function",
                  function: {
                    name: "get_weather",
                    arguments: '{"location":"SF"}',
                  },
                },
              ],
            },
          },
        ],
      };
      const result = openaiMatcher.parseResponse(body);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls?.[0].name).toBe("get_weather");
      expect(result.toolCalls?.[0].id).toBe("call_abc");
      expect(result.toolCalls?.[0].argumentLength).toBe(17); // '{"location":"SF"}' = 17 chars
    });

    it("returns empty result for non-object body", () => {
      const result = openaiMatcher.parseResponse(null);
      expect(result.tokens).toBeUndefined();
      expect(result.toolCalls).toBeUndefined();
    });
  });

  describe("parseStreamChunk", () => {
    it("returns done for [DONE]", () => {
      expect(openaiMatcher.parseStreamChunk?.("[DONE]")?.done).toBe(true);
    });

    it("extracts usage from final chunk", () => {
      const chunk = JSON.stringify({
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          prompt_tokens_details: { cached_tokens: 30 },
        },
      });
      const result = openaiMatcher.parseStreamChunk?.(chunk);
      expect(result?.tokens?.input).toBe(100);
      expect(result?.tokens?.output).toBe(50);
      expect(result?.tokens?.cachedInput).toBe(30);
      expect(result?.done).toBe(true);
    });

    it("returns undefined for invalid JSON", () => {
      expect(openaiMatcher.parseStreamChunk?.("not json")).toBeUndefined();
    });

    it("extracts tool call deltas", () => {
      const chunk = JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  id: "call_xyz",
                  function: { name: "search", arguments: '{"q":"' },
                },
              ],
            },
          },
        ],
      });
      const result = openaiMatcher.parseStreamChunk?.(chunk);
      expect(result?.toolCalls).toHaveLength(1);
      expect(result?.toolCalls?.[0].name).toBe("search");
    });
  });

  describe("parseError", () => {
    it("extracts error type from body", () => {
      const result = openaiMatcher.parseError?.(400, {
        error: { type: "invalid_request_error", message: "Bad request" },
      });
      expect(result?.type).toBe("invalid_request_error");
      expect(result?.message).toBe("Bad request");
    });

    it("returns rate_limit_exceeded for 429", () => {
      const result = openaiMatcher.parseError?.(429, {});
      expect(result?.type).toBe("rate_limit_exceeded");
    });

    it("returns authentication_error for 401", () => {
      const result = openaiMatcher.parseError?.(401, {});
      expect(result?.type).toBe("authentication_error");
    });

    it("returns context_length_exceeded for 413", () => {
      const result = openaiMatcher.parseError?.(413, {});
      expect(result?.type).toBe("context_length_exceeded");
    });

    it("returns undefined for unknown status without body", () => {
      expect(openaiMatcher.parseError?.(500, {})).toBeUndefined();
    });
  });
});

describe("anthropicMatcher", () => {
  describe("match", () => {
    it("matches api.anthropic.com", () => {
      expect(anthropicMatcher.match("https://api.anthropic.com/v1/messages", "POST")).toBe(true);
    });

    it("does not match other hosts", () => {
      expect(anthropicMatcher.match("https://api.openai.com/v1/chat/completions", "POST")).toBe(false);
    });
  });

  describe("extractOperation", () => {
    it("detects messages as chat", () => {
      expect(anthropicMatcher.extractOperation("https://api.anthropic.com/v1/messages")).toBe("chat");
    });
  });

  describe("parseResponse", () => {
    it("extracts basic token usage", () => {
      const body = {
        model: "claude-3-5-sonnet-20241022",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };
      const result = anthropicMatcher.parseResponse(body);
      expect(result.tokens?.input).toBe(100);
      expect(result.tokens?.output).toBe(50);
    });

    it("extracts cache tokens", () => {
      const body = {
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 80,
          cache_creation_input_tokens: 20,
        },
      };
      const result = anthropicMatcher.parseResponse(body);
      expect(result.tokens?.cachedInput).toBe(80);
      expect(result.tokens?.cacheCreationInput).toBe(20);
    });

    it("extracts tool_use blocks from content", () => {
      const body = {
        content: [
          { type: "text", text: "Sure" },
          {
            type: "tool_use",
            id: "toolu_abc",
            name: "get_weather",
            input: { location: "SF" },
          },
        ],
      };
      const result = anthropicMatcher.parseResponse(body);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls?.[0].name).toBe("get_weather");
      expect(result.toolCalls?.[0].id).toBe("toolu_abc");
    });
  });

  describe("parseStreamChunk", () => {
    it("extracts input tokens from message_start", () => {
      const chunk = JSON.stringify({
        type: "message_start",
        message: {
          usage: {
            input_tokens: 100,
            cache_read_input_tokens: 80,
            cache_creation_input_tokens: 20,
          },
        },
      });
      const result = anthropicMatcher.parseStreamChunk?.(chunk);
      expect(result?.tokens?.input).toBe(100);
      expect(result?.tokens?.cachedInput).toBe(80);
      expect(result?.tokens?.cacheCreationInput).toBe(20);
    });

    it("extracts output tokens from message_delta", () => {
      const chunk = JSON.stringify({
        type: "message_delta",
        usage: { output_tokens: 50 },
      });
      const result = anthropicMatcher.parseStreamChunk?.(chunk);
      expect(result?.tokens?.output).toBe(50);
      expect(result?.done).toBe(true);
    });

    it("returns done for message_stop", () => {
      const chunk = JSON.stringify({ type: "message_stop" });
      const result = anthropicMatcher.parseStreamChunk?.(chunk);
      expect(result?.done).toBe(true);
    });

    it("returns undefined for unknown event types", () => {
      const chunk = JSON.stringify({ type: "content_block_delta" });
      const result = anthropicMatcher.parseStreamChunk?.(chunk);
      expect(result).toBeUndefined();
    });
  });

  describe("parseError", () => {
    it("extracts error from body", () => {
      const result = anthropicMatcher.parseError?.(400, {
        error: { type: "invalid_request_error", message: "Bad request" },
      });
      expect(result?.type).toBe("invalid_request_error");
    });

    it("returns rate_limit_error for 429", () => {
      expect(anthropicMatcher.parseError?.(429, {})?.type).toBe("rate_limit_error");
    });

    it("returns overloaded_error for 529", () => {
      expect(anthropicMatcher.parseError?.(529, {})?.type).toBe("overloaded_error");
    });
  });
});

describe("genericMatcher", () => {
  it("never matches by URL", () => {
    expect(genericMatcher.match("https://anything.com", "POST")).toBe(false);
  });

  it("extracts model from body", () => {
    expect(genericMatcher.extractModel({ model: "custom-model" })).toBe("custom-model");
  });

  it("extracts usage from various shapes", () => {
    expect(
      genericMatcher.parseResponse({ usage: { prompt_tokens: 100, completion_tokens: 50 } }).tokens
    ).toEqual({ input: 100, output: 50 });

    expect(
      genericMatcher.parseResponse({ usage: { input_tokens: 100, output_tokens: 50 } }).tokens
    ).toEqual({ input: 100, output: 50 });
  });

  it("parses errors by status code", () => {
    expect(genericMatcher.parseError?.(429, {})?.type).toBe("rate_limit");
    expect(genericMatcher.parseError?.(401, {})?.type).toBe("auth_error");
  });
});

describe("bodyLooksLikeAI", () => {
  it("returns true for OpenAI-style request", () => {
    expect(
      bodyLooksLikeAI({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
      })
    ).toBe(true);
  });

  it("returns true for Anthropic-style request", () => {
    expect(
      bodyLooksLikeAI({
        model: "claude-3-5-sonnet",
        messages: [{ role: "user", content: "Hi" }],
      })
    ).toBe(true);
  });

  it("returns true for embeddings request", () => {
    expect(
      bodyLooksLikeAI({
        model: "text-embedding-3-small",
        input: ["hello", "world"],
      })
    ).toBe(true);
  });

  it("returns true for legacy completions request", () => {
    expect(
      bodyLooksLikeAI({
        model: "gpt-3.5-turbo-instruct",
        prompt: "Hello",
      })
    ).toBe(true);
  });

  it("returns false for non-AI POST body", () => {
    expect(bodyLooksLikeAI({ username: "user", password: "pass" })).toBe(false);
    expect(bodyLooksLikeAI({ foo: "bar" })).toBe(false);
  });

  it("returns false for non-object body", () => {
    expect(bodyLooksLikeAI(null)).toBe(false);
    expect(bodyLooksLikeAI("string")).toBe(false);
    expect(bodyLooksLikeAI(undefined)).toBe(false);
  });

  it("returns false when model present but no messages/prompt/input", () => {
    expect(bodyLooksLikeAI({ model: "gpt-4o" })).toBe(false);
  });
});
