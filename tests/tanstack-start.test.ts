import { describe, it, expect, vi } from "vitest";
import { FlareLog } from "../src/client";
import { tanstackStartMiddleware, withTanStackStart } from "../src/frameworks/tanstack-start";

describe("tanstack-start middleware", () => {
  it("should attach logger and log request completion", async () => {
    const logger = new FlareLog({
      apiKey: "test-key",
      endpoint: "http://localhost:9999",
      batchSize: 1,
    });

    const ctx = {
      request: {
        headers: {},
        method: "GET",
        url: "/test",
      },
      response: {
        status: 200,
        statusText: "OK",
        headers: new Headers(),
      },
      set: vi.fn(),
      get: vi.fn(),
    };

    const next = vi.fn().mockResolvedValue(undefined);

    const middleware = tanstackStartMiddleware(logger);
    await middleware(ctx as any, next);

    expect(ctx.set).toHaveBeenCalledWith("logger", expect.anything());
    expect(next).toHaveBeenCalled();
  });

  it("should log errors", async () => {
    const logger = new FlareLog({
      apiKey: "test-key",
      endpoint: "http://localhost:9999",
      batchSize: 1,
    });

    const ctx = {
      request: {
        headers: {},
        method: "GET",
        url: "/test",
      },
      response: {
        status: 200,
        statusText: "OK",
        headers: new Headers(),
      },
      set: vi.fn(),
      get: vi.fn(),
    };

    const error = new Error("Test error");
    const next = vi.fn().mockRejectedValue(error);

    const middleware = tanstackStartMiddleware(logger);
    
    await expect(middleware(ctx as any, next)).rejects.toThrow("Test error");
  });
});

describe("withTanStackStart", () => {
  it("should wrap handler and log requests", async () => {
    const logger = new FlareLog({
      apiKey: "test-key",
      endpoint: "http://localhost:9999",
      batchSize: 1,
    });

    const ctx = {
      request: {
        headers: {},
        method: "GET",
        url: "/api/test",
      },
      response: {
        status: 200,
        statusText: "OK",
        headers: new Headers(),
      },
      set: vi.fn(),
      get: vi.fn(),
    };

    const handler = vi.fn().mockResolvedValue(new Response("OK"));

    const wrapped = withTanStackStart(logger, handler);
    await wrapped(ctx as any);

    expect(handler).toHaveBeenCalled();
    expect(ctx.set).toHaveBeenCalledWith("logger", expect.anything());
  });
});
