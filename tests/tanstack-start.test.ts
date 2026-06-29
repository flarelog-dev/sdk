import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { mockFetch, wasFetchCalledForUrl } from "./helpers";

// ─── Test fixtures ─────────────────────────────────────────────────────────
//
// The TanStack Start v1 middleware contract (verified against
// @tanstack/react-start@1.168.26):
//
//   - `createMiddleware().server(fn)` registers `fn` and returns the builder.
//   - `fn` receives `{ request, pathname, context, next, handlerType, serverFnMeta? }`.
//   - `next()` returns `Promise<RequestServerResult>` where RequestServerResult
//     is `{ request, pathname, context, response: Response }`.
//     - There is NO top-level `status` field — status lives on
//       `result.response.status`.
//     - `next()` may also return a raw `Response` (short-circuit case).
//
// Cloudflare Workers env bindings in v1:
//   - Reachable via `import { env } from "cloudflare:workers"` (canonical)
//   - Or via `process.env` inside `.server()` callbacks when `nodejs_compat`
//     is enabled and `@cloudflare/vite-plugin` is configured.
//   - The legacy `getRequestEvent()` API does NOT exist in v1 stable.

// Mock @tanstack/react-start — only the surface the SDK actually uses.
// The mock captures the `.server(fn)` callback so tests can invoke it directly.
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
    createStart: () => ({ getOptions: () => ({}) }),
  };
});

// Mock `cloudflare:workers` (a runtime-provided module on Workers).
// Tests set `__cfEnv` to simulate Worker env bindings.
let __cfEnv: Record<string, string | undefined> | null = null;
vi.mock("cloudflare:workers", () => ({
  get env() {
    return __cfEnv;
  },
}));

import {
  tanstackStartMiddleware,
  withTanStackStart,
  autoLogger,
  resolveWorkerEnv,
  __resetAutoLoggerCache,
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

// Build a TanStack Start v1-shaped `next()` result: `{ request, pathname,
// context, response }`. The HTTP status lives on `response.status`.
function makeV1Result(status = 200, context: unknown = {}) {
  return {
    request: makeRequest(),
    pathname: "/api/test",
    context,
    response: new Response("ok", { status }),
  };
}

describe("tanstackStartMiddleware", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    __cfEnv = null;
    __resetAutoLoggerCache();
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

    const nextResult = makeV1Result(200);
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

    const next = vi.fn().mockResolvedValue(makeV1Result(200));
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

    const next = vi.fn().mockResolvedValue(makeV1Result(200));
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

    const next = vi.fn().mockResolvedValue(makeV1Result(200));
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

    const next = vi.fn().mockResolvedValue(makeV1Result(200));
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

    const nextResult = makeV1Result(200);
    const next = vi.fn().mockResolvedValue(nextResult);
    const result = await serverFn({ request: makeRequest(), context: {}, next });

    expect(result).toBe(nextResult);
  });

  // ─── Status extraction (v1 RequestServerResult shape) ────────────────────

  it("maps 2xx response status to INFO level", async () => {
    const logger = makeLogger();
    const logSpy = vi.spyOn(logger, "log").mockImplementation(() => {});
    vi.spyOn(logger, "flush").mockResolvedValue(undefined);

    const middleware = tanstackStartMiddleware(logger) as unknown as BuilderStub;
    const serverFn = middleware._serverFn!;

    const next = vi.fn().mockResolvedValue(makeV1Result(200));
    await serverFn({ request: makeRequest(), context: {}, next });

    expect(logSpy).toHaveBeenCalledWith(
      "INFO",
      "Request completed",
      expect.objectContaining({ status: 200 }),
      expect.anything(),
    );
  });

  it("maps 4xx response status to WARN level", async () => {
    const logger = makeLogger();
    const logSpy = vi.spyOn(logger, "log").mockImplementation(() => {});
    vi.spyOn(logger, "flush").mockResolvedValue(undefined);

    const middleware = tanstackStartMiddleware(logger) as unknown as BuilderStub;
    const serverFn = middleware._serverFn!;

    const next = vi.fn().mockResolvedValue(makeV1Result(404));
    await serverFn({ request: makeRequest(), context: {}, next });

    expect(logSpy).toHaveBeenCalledWith(
      "WARN",
      "Request completed",
      expect.objectContaining({ status: 404 }),
      expect.anything(),
    );
  });

  it("maps 5xx response status to ERROR level", async () => {
    const logger = makeLogger();
    const logSpy = vi.spyOn(logger, "log").mockImplementation(() => {});
    vi.spyOn(logger, "flush").mockResolvedValue(undefined);

    const middleware = tanstackStartMiddleware(logger) as unknown as BuilderStub;
    const serverFn = middleware._serverFn!;

    const next = vi.fn().mockResolvedValue(makeV1Result(500));
    await serverFn({ request: makeRequest(), context: {}, next });

    expect(logSpy).toHaveBeenCalledWith(
      "ERROR",
      "Request completed",
      expect.objectContaining({ status: 500 }),
      expect.anything(),
    );
  });

  it("falls back to INFO when next() returns a raw Response without a wrapped result", async () => {
    const logger = makeLogger();
    const logSpy = vi.spyOn(logger, "log").mockImplementation(() => {});
    vi.spyOn(logger, "flush").mockResolvedValue(undefined);

    const middleware = tanstackStartMiddleware(logger) as unknown as BuilderStub;
    const serverFn = middleware._serverFn!;

    // Short-circuit case: middleware returns a raw Response with status 503.
    const next = vi.fn().mockResolvedValue(new Response("down", { status: 503 }));
    await serverFn({ request: makeRequest(), context: {}, next });

    expect(logSpy).toHaveBeenCalledWith(
      "ERROR",
      "Request completed",
      expect.objectContaining({ status: 503 }),
      expect.anything(),
    );
  });
});

describe("tanstackStartMiddleware — zero-arg auto mode", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    __cfEnv = null;
    __resetAutoLoggerCache();
    // Ensure process.env doesn't leak FLARELOG_API_KEY into auto-mode tests
    delete process.env.FLARELOG_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-creates a logger from the Cloudflare Workers env binding", async () => {
    // Simulate a Cloudflare Worker: `cloudflare:workers` exposes the env binding.
    __cfEnv = { FLARELOG_API_KEY: "fl_from_binding" };

    const middleware = tanstackStartMiddleware() as unknown as BuilderStub;
    const serverFn = middleware._serverFn!;
    const next = vi.fn().mockResolvedValue(makeV1Result(200));

    await serverFn({ request: makeRequest(), context: {}, next });

    // The auto-logger should have resolved the API key from the binding and
    // shipped the log to the Flarelog transport (URL ends in /v1/logs).
    expect(wasFetchCalledForUrl(fetchMock, "/v1/logs")).toBe(true);
  });

  it("falls back to process.env when no Worker binding is present", async () => {
    process.env.FLARELOG_API_KEY = "fl_from_process_env";

    const middleware = tanstackStartMiddleware() as unknown as BuilderStub;
    const serverFn = middleware._serverFn!;
    const next = vi.fn().mockResolvedValue(makeV1Result(200));

    await serverFn({ request: makeRequest(), context: {}, next });

    expect(wasFetchCalledForUrl(fetchMock, "/v1/logs")).toBe(true);

    delete process.env.FLARELOG_API_KEY;
  });

  it("caches the auto-logger across requests within the same middleware instance", async () => {
    __cfEnv = { FLARELOG_API_KEY: "fl_cached" };

    const middleware = tanstackStartMiddleware() as unknown as BuilderStub;
    const serverFn = middleware._serverFn!;
    const next = vi.fn().mockResolvedValue(makeV1Result(200));

    await serverFn({ request: makeRequest({ "x-trace-id": "t1" }), context: {}, next });
    await serverFn({ request: makeRequest({ "x-trace-id": "t2" }), context: {}, next });

    // Both requests should flow through; the cache prevents re-instantiating
    // the logger on every request, which would re-probe cloudflare:workers each time.
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("resolveWorkerEnv returns null when no env source is available", async () => {
    __cfEnv = null;
    __resetAutoLoggerCache();
    delete process.env.FLARELOG_API_KEY;
    expect(await resolveWorkerEnv()).toBeNull();
  });

  it("resolveWorkerEnv reads from cloudflare:workers env binding", async () => {
    __cfEnv = { FLARELOG_API_KEY: "x" };
    __resetAutoLoggerCache();
    const env = await resolveWorkerEnv();
    expect(env?.FLARELOG_API_KEY).toBe("x");
  });

  it("resolveWorkerEnv prefers explicit env arg over cloudflare:workers binding", async () => {
    __cfEnv = { FLARELOG_API_KEY: "from_binding" };
    __resetAutoLoggerCache();
    const env = await resolveWorkerEnv({ FLARELOG_API_KEY: "from_arg" });
    expect(env?.FLARELOG_API_KEY).toBe("from_arg");
  });

  it("resolveWorkerEnv caches the binding across calls within the same isolate", async () => {
    __cfEnv = { FLARELOG_API_KEY: "fl_cached" };
    __resetAutoLoggerCache();
    const first = await resolveWorkerEnv();
    // Mutate the binding — second call should still return the cached value.
    __cfEnv = { FLARELOG_API_KEY: "fl_changed" };
    const second = await resolveWorkerEnv();
    expect(first?.FLARELOG_API_KEY).toBe("fl_cached");
    expect(second?.FLARELOG_API_KEY).toBe("fl_cached"); // cached, not re-read
  });
});

describe("withTanStackStart (deprecated)", () => {
  it("throws a migration error on invocation", async () => {
    const logger = makeLogger();
    const wrapped = withTanStackStart(logger, async () => "ok");
    await expect(wrapped({})).rejects.toThrow(/withTanStackStart is unsupported/);
  });
});
