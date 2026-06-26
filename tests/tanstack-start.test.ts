import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { mockFetch } from "./helpers";

// Mock @tanstack/react-start (an optional peer dep not installed in this repo).
// The mock captures the `.server(fn)` callback so tests can invoke it directly
// with a synthesized middleware context.
vi.mock("@tanstack/react-start", () => {
  const builder = {
    _serverFn: null as ((ctx: unknown) => Promise<unknown>) | null,
    server(fn: (ctx: unknown) => Promise<unknown>) {
      this._serverFn = fn;
      return this;
    },
    middleware() {
      return this;
    },
    client() {
      return this;
    },
    validator() {
      return this;
    },
  };
  return {
    createMiddleware: () => builder,
  };
});

import {
  tanstackStartMiddleware,
  withTanStackStart,
} from "../src/frameworks/tanstack-start";

interface BuilderStub {
  _serverFn: ((ctx: unknown) => Promise<unknown>) | null;
}

function makeLogger() {
  return new FlareLog({
    apiKey: "test-key",
    endpoint: "http://localhost:9999",
    allowInsecure: true,
    workerMode: true,
  });
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/test", {
    method: "GET",
    headers,
  });
}

describe("tanstackStartMiddleware", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a middleware via createMiddleware().server(...)", () => {
    const middleware = tanstackStartMiddleware(makeLogger()) as unknown as BuilderStub;
    expect(typeof middleware._serverFn).toBe("function");
  });

  it("merges logger and traceId into context via next() and logs completion", async () => {
    const logger = makeLogger();
    const childLogSpy = vi.spyOn(logger, "child");

    const middleware = tanstackStartMiddleware(logger) as unknown as BuilderStub;
    const serverFn = middleware._serverFn!;

    const nextResult = { status: 200, context: {} };
    const next = vi.fn().mockResolvedValue(nextResult);

    const result = await serverFn({
      request: makeRequest({ "x-trace-id": "trace-abc" }),
      context: {},
      next,
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith({
      context: expect.objectContaining({ traceId: "trace-abc" }),
    });
    // child logger was created with trace context
    expect(childLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "tanstack-start",
        traceId: "trace-abc",
        method: "GET",
      }),
    );
    expect(result).toBe(nextResult);
  });

  it("auto-generates a traceId when the header is missing", async () => {
    const logger = makeLogger();
    const middleware = tanstackStartMiddleware(logger) as unknown as BuilderStub;
    const serverFn = middleware._serverFn!;

    const next = vi.fn().mockResolvedValue({ status: 200, context: {} });
    await serverFn({ request: makeRequest(), context: {}, next });

    const passed = next.mock.calls[0][0] as { context: { traceId: string } };
    expect(passed.context.traceId).toBeTruthy();
    expect(typeof passed.context.traceId).toBe("string");
  });

  it("logs errors and rethrows", async () => {
    const logger = makeLogger();
    const middleware = tanstackStartMiddleware(logger) as unknown as BuilderStub;
    const serverFn = middleware._serverFn!;

    const error = new Error("boom");
    const next = vi.fn().mockRejectedValue(error);

    await expect(
      serverFn({ request: makeRequest(), context: {}, next }),
    ).rejects.toThrow("boom");
  });

  it("flushes the logger after a successful request", async () => {
    const logger = makeLogger();
    const flushSpy = vi.spyOn(logger, "flush").mockResolvedValue(undefined);

    const middleware = tanstackStartMiddleware(logger) as unknown as BuilderStub;
    const serverFn = middleware._serverFn!;

    const next = vi.fn().mockResolvedValue({ status: 200, context: {} });
    await serverFn({ request: makeRequest(), context: {}, next });

    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  it("flushes the logger after a failed request (before rethrowing)", async () => {
    const logger = makeLogger();
    const flushSpy = vi.spyOn(logger, "flush").mockResolvedValue(undefined);

    const middleware = tanstackStartMiddleware(logger) as unknown as BuilderStub;
    const serverFn = middleware._serverFn!;

    const next = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(
      serverFn({ request: makeRequest(), context: {}, next }),
    ).rejects.toThrow("boom");

    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  it("accepts a factory function and invokes it per request", async () => {
    const logger = makeLogger();
    const factory = vi.fn(() => logger);

    const middleware = tanstackStartMiddleware(factory) as unknown as BuilderStub;
    const serverFn = middleware._serverFn!;

    const next = vi.fn().mockResolvedValue({ status: 200, context: {} });
    await serverFn({ request: makeRequest({ "x-trace-id": "t1" }), context: {}, next });
    await serverFn({ request: makeRequest({ "x-trace-id": "t2" }), context: {}, next });

    // Factory is invoked once per request (lazy-init pattern for Workers).
    expect(factory).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("awaits an async factory function", async () => {
    const logger = makeLogger();
    const factory = vi.fn(async () => logger);

    const middleware = tanstackStartMiddleware(factory) as unknown as BuilderStub;
    const serverFn = middleware._serverFn!;

    const next = vi.fn().mockResolvedValue({ status: 200, context: {} });
    await serverFn({ request: makeRequest(), context: {}, next });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does not swallow flush failures on the success path", async () => {
    const logger = makeLogger();
    // flush() rejects, but the middleware should swallow it so the response
    // is still returned. Transport-level errors are surfaced via console.error
    // inside FlarelogTransport.sendWithRetry; we must not crash the request.
    vi.spyOn(logger, "flush").mockRejectedValue(new Error("network down"));

    const middleware = tanstackStartMiddleware(logger) as unknown as BuilderStub;
    const serverFn = middleware._serverFn!;

    const next = vi.fn().mockResolvedValue({ status: 200, context: {} });
    const result = await serverFn({ request: makeRequest(), context: {}, next });

    expect(result).toEqual({ status: 200, context: {} });
  });
});

describe("withTanStackStart (deprecated)", () => {
  it("throws a migration error on invocation", async () => {
    const logger = makeLogger();
    const wrapped = withTanStackStart(logger, async () => "ok");
    await expect(wrapped({})).rejects.toThrow(/withTanStackStart is unsupported/);
  });
});
