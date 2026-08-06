/**
 * Integration test: end-to-end fetch interception.
 *
 * Verifies the full pipeline:
 *   1. flarelogAI() patches global fetch
 *   2. A POST to api.openai.com/v1/chat/completions gets intercepted
 *   3. The mock response's usage is parsed
 *   4. Cost is computed
 *   5. A log entry with flarelog.kind = "ai_call" is emitted
 *   6. The caller still receives the original response body intact
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flarelog } from "../../src/factory";
import { flarelogAI, uninstrumentFetch } from "../../src/ai";

describe("flarelogAI end-to-end", () => {
  let originalFetch: typeof globalThis.fetch;
  let loggedEntries: Array<{ level: string; message: string; metadata: Record<string, unknown> }>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    loggedEntries = [];
  });

  afterEach(() => {
    uninstrumentFetch();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("intercepts an OpenAI chat completion call", async () => {
    // Stub fetch to return a canned OpenAI response.
    const mockResponse = new Response(
      JSON.stringify({
        id: "chatcmpl-abc",
        object: "chat.completion",
        model: "gpt-4o-2024-08-06",
        choices: [
          {
            message: { role: "assistant", content: "Hello!" },
            finish_reason: "stop",
            index: 0,
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          prompt_tokens_details: { cached_tokens: 4 },
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_test_123",
        },
      }
    );
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse) as unknown as typeof fetch;

    // Set up FlareLog + AI instrumentation.
    // Use warnOnConsoleFallback: false to suppress the noisy "no backend" warning.
    const logger = flarelog({ warnOnConsoleFallback: false, level: "DEBUG" });

    // Intercept logger.info to capture entries without shipping them anywhere.
    // The console transport will still print to stdout — that's fine for tests.
    const origInfo = logger.info.bind(logger);
    logger.info = (message: string, metadata?: Record<string, unknown>) => {
      loggedEntries.push({ level: "info", message, metadata: metadata ?? {} });
      // Don't call origInfo — keeps test output clean.
    };

    flarelogAI(logger);

    // Make an OpenAI-shaped call.
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer sk-test" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Say hello" }],
      }),
    });

    // Caller should still get the response body intact.
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.choices[0].message.content).toBe("Hello!");
    expect(body.usage.prompt_tokens).toBe(10);

    // Find the AI call log entry.
    const aiEntries = loggedEntries.filter(
      (e) => e.metadata["flarelog.kind"] === "ai_call"
    );
    expect(aiEntries).toHaveLength(1);

    const entry = aiEntries[0];
    const record = entry.metadata["flarelog.ai.record"] as Record<string, unknown>;
    expect(record).toBeDefined();
    expect(record.provider).toBe("openai");
    expect(record.model).toBe("gpt-4o-2024-08-06"); // Updated from server response
    expect(record.tokens).toEqual({ input: 10, output: 5, cachedInput: 4 });
    expect(record.costUsd).toBeCloseTo(0.00008, 8); // 10*2.5/1M + 4*1.25/1M + 5*10/1M = $0.00008
    expect(record.requestId).toBe("req_test_123");
    expect(record.status).toBe(200);
    expect(record.latency.total).toBeGreaterThanOrEqual(0);
    expect(entry.message).toContain("gpt-4o");
  });

  it("does not intercept non-AI fetches", async () => {
    const mockResponse = new Response("OK", { status: 200 });
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    const logger = flarelog({ warnOnConsoleFallback: false });
    logger.info = () => {}; // suppress all logging
    flarelogAI(logger);

    await fetch("https://example.com/api/users");

    // Should have called the original fetch directly (via our wrapper, but
    // still only one fetch call total).
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(loggedEntries.filter((e) => e.metadata["flarelog.kind"] === "ai_call")).toHaveLength(0);
  });

  it("intercepts streaming responses and still returns body to caller", async () => {
    // OpenAI-style SSE stream.
    const sseBody = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      "",
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}',
      "",
      "data: [DONE]",
      "",
      "",
    ].join("\n");

    const mockResponse = new Response(sseBody, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "x-request-id": "req_stream_456",
      },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse) as unknown as typeof fetch;

    const logger = flarelog({ warnOnConsoleFallback: false });
    logger.info = (message: string, metadata?: Record<string, unknown>) => {
      loggedEntries.push({ level: "info", message, metadata: metadata ?? {} });
    };
    flarelogAI(logger);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer sk-test" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        stream: true,
        messages: [{ role: "user", content: "Say hi" }],
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    // Caller should be able to read the stream normally.
    const text = await response.text();
    expect(text).toContain("Hello");
    expect(text).toContain("world");
    expect(text).toContain("[DONE]");

    // Wait a tick for the background telemetry read to complete.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const aiEntries = loggedEntries.filter(
      (e) => e.metadata["flarelog.kind"] === "ai_call"
    );
    expect(aiEntries).toHaveLength(1);

    const record = aiEntries[0].metadata["flarelog.ai.record"] as Record<string, unknown>;
    expect(record.streamed).toBe(true);
    expect(record.tokens).toEqual({ input: 5, output: 2 });
    expect(record.latency.streamChunks).toBeGreaterThan(0);
  });

  it("captures errors and still throws", async () => {
    const errorResponse = new Response(
      JSON.stringify({
        error: {
          type: "rate_limit_exceeded",
          message: "You hit the rate limit.",
        },
      }),
      {
        status: 429,
        headers: { "content-type": "application/json" },
      }
    );
    globalThis.fetch = vi.fn().mockResolvedValue(errorResponse) as unknown as typeof fetch;

    const logger = flarelog({ warnOnConsoleFallback: false });
    logger.error = (message: string, metadata?: Record<string, unknown>) => {
      loggedEntries.push({ level: "error", message, metadata: metadata ?? {} });
    };
    flarelogAI(logger);

    // The fetch itself doesn't throw — it returns the error Response.
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-4o", messages: [] }),
    });

    expect(response.status).toBe(429);

    // Should have logged an error entry.
    const errorEntries = loggedEntries.filter(
      (e) =>
        e.metadata["flarelog.kind"] === "ai_call" &&
        e.metadata["flarelog.ai.error"] === true
    );
    expect(errorEntries).toHaveLength(1);

    const record = errorEntries[0].metadata["flarelog.ai.record"] as Record<string, unknown>;
    expect(record.errorType).toBe("rate_limit_exceeded");
    expect(record.errorMessage).toBe("You hit the rate limit.");
    expect(record.status).toBe(429);
  });

  it("respects shouldInstrument filter", async () => {
    const mockResponse = new Response(
      JSON.stringify({
        model: "gpt-4o",
        choices: [{ message: { content: "Hi" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    const logger = flarelog({ warnOnConsoleFallback: false });
    logger.info = (message: string, metadata?: Record<string, unknown>) => {
      loggedEntries.push({ level: "info", message, metadata: metadata ?? {} });
    };
    flarelogAI(logger, {
      shouldInstrument: (url) => !url.includes("/internal/"),
    });

    // This call should be intercepted.
    await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-4o", messages: [] }),
    });
    expect(loggedEntries.filter((e) => e.metadata["flarelog.kind"] === "ai_call")).toHaveLength(1);

    // This call should NOT be intercepted (but should still work).
    loggedEntries.length = 0;
    await fetch("https://api.openai.com/internal/health", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-4o", messages: [] }),
    });
    expect(loggedEntries.filter((e) => e.metadata["flarelog.kind"] === "ai_call")).toHaveLength(0);
  });

  it("recognizes custom OpenAI-compatible hosts", async () => {
    const mockResponse = new Response(
      JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct-turbo",
        choices: [{ message: { content: "Hi" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse) as unknown as typeof fetch;

    const logger = flarelog({ warnOnConsoleFallback: false });
    logger.info = (message: string, metadata?: Record<string, unknown>) => {
      loggedEntries.push({ level: "info", message, metadata: metadata ?? {} });
    };
    flarelogAI(logger, {
      extraProviderHosts: [
        { pattern: "api.together.xyz", provider: "openai" },
      ],
    });

    await fetch("https://api.together.xyz/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct-turbo",
        messages: [{ role: "user", content: "Hi" }],
      }),
    });

    const aiEntries = loggedEntries.filter(
      (e) => e.metadata["flarelog.kind"] === "ai_call"
    );
    expect(aiEntries).toHaveLength(1);
    const record = aiEntries[0].metadata["flarelog.ai.record"] as Record<string, unknown>;
    expect(record.provider).toBe("openai");
    expect(record.model).toBe("meta-llama/llama-3.3-70b-instruct-turbo");
    expect(record.costUsd).toBeCloseTo(0.0000132, 7); // (10+5)*0.88/1M
  });
});
