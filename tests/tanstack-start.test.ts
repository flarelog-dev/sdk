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
});

describe("withTanStackStart (deprecated)", () => {
  it("throws a migration error on invocation", async () => {
    const logger = makeLogger();
    const wrapped = withTanStackStart(logger, async () => "ok");
    await expect(wrapped({})).rejects.toThrow(/withTanStackStart is unsupported/);
  });
});
