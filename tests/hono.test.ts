import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { mockFetch, wasFetchCalledForUrl } from "./helpers";
import { __resetAutoLoggerCache } from "../src/frameworks/auto-logger";

// Mock vinxi/http so the auto-logger can find a Worker env binding in tests.
let __currentEvent: unknown = null;
vi.mock("vinxi/http", () => ({
  getEvent: () => __currentEvent,
}));

import { honoMiddleware } from "../src/frameworks/hono";

interface HonoContextStub {
  req: {
    header: (name: string) => string | undefined;
    method: string;
    path: string;
  };
  res: { status: number };
  set: (key: string, value: unknown) => void;
  env?: Record<string, string | undefined>;
  logger?: unknown;
}

function makeLogger() {
  return new FlareLog({
    apiKey: "test-key",
    endpoint: "http://localhost:9999",
    allowInsecure: true,
    workerMode: true,
  });
}

function makeContext(
  opts: Partial<HonoContextStub> = {},
): HonoContextStub {
  return {
    req: {
      header: () => undefined,
      method: "GET",
      path: "/api/test",
    },
    res: { status: 200 },
    set: (k, v) => {
      (opts as Record<string, unknown>)[k] = v;
    },
    ...opts,
  };
}

describe("honoMiddleware", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    __currentEvent = null;
    __resetAutoLoggerCache();
    delete process.env.FLARELOG_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a middleware function", () => {
    const mw = honoMiddleware(makeLogger());
    expect(typeof mw).toBe("function");
  });

  it("merges logger into context via c.set() and logs completion", async () => {
    const logger = makeLogger();
    const childSpy = vi.spyOn(logger, "child");
    const mw = honoMiddleware(logger);

    const ctx = makeContext();
    const next = vi.fn().mockResolvedValue(undefined);
    await mw(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(childSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "hono",
        method: "GET",
        path: "/api/test",
      }),
    );
  });

  it("uses x-trace-id header when present", async () => {
    const logger = makeLogger();
    const childSpy = vi.spyOn(logger, "child");
    const mw = honoMiddleware(logger);

    const ctx = makeContext({
      req: {
        header: (name: string) =>
          name === "x-trace-id" ? "trace-xyz" : undefined,
        method: "POST",
        path: "/api/submit",
      },
    });
    await mw(ctx, vi.fn().mockResolvedValue(undefined));

    expect(childSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace-xyz",
        method: "POST",
        path: "/api/submit",
      }),
    );
  });

  it("auto-generates a traceId when header is missing", async () => {
    const logger = makeLogger();
    const childSpy = vi.spyOn(logger, "child");
    const mw = honoMiddleware(logger);

    await mw(makeContext(), vi.fn().mockResolvedValue(undefined));

    const call = childSpy.mock.calls[0][0] as { traceId: string };
    expect(call.traceId).toBeTruthy();
    expect(typeof call.traceId).toBe("string");
  });

  it("logs errors and rethrows", async () => {
    const logger = makeLogger();
    const mw = honoMiddleware(logger);
    const error = new Error("boom");
    const next = vi.fn().mockRejectedValue(error);

    await expect(
      mw(makeContext(), next),
    ).rejects.toThrow("boom");
  });

  it("flushes the logger after a successful request", async () => {
    const logger = makeLogger();
    const flushSpy = vi.spyOn(logger, "flush").mockResolvedValue(undefined);
    const mw = honoMiddleware(logger);

    await mw(makeContext(), vi.fn().mockResolvedValue(undefined));

    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  it("flushes the logger after a failed request (before rethrowing)", async () => {
    const logger = makeLogger();
    const flushSpy = vi.spyOn(logger, "flush").mockResolvedValue(undefined);
    const mw = honoMiddleware(logger);

    await expect(
      mw(makeContext(), vi.fn().mockRejectedValue(new Error("boom"))),
    ).rejects.toThrow("boom");

    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  it("accepts a factory function and invokes it with the Hono context", async () => {
    const logger = makeLogger();
    const factory = vi.fn((_c: unknown) => logger);
    const mw = honoMiddleware(factory);

    const ctx = makeContext();
    await mw(ctx, vi.fn().mockResolvedValue(undefined));

    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(ctx);
  });

  it("does not swallow flush failures on the success path", async () => {
    const logger = makeLogger();
    vi.spyOn(logger, "flush").mockRejectedValue(new Error("network down"));
    const mw = honoMiddleware(logger);

    // Should not throw — middleware swallows flush errors
    await expect(
      mw(makeContext(), vi.fn().mockResolvedValue(undefined)),
    ).resolves.toBeUndefined();
  });
});

describe("honoMiddleware — zero-arg auto mode", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    __currentEvent = null;
    __resetAutoLoggerCache();
    delete process.env.FLARELOG_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-creates a logger from c.env (Hono on Workers)", async () => {
    const ctx = makeContext({
      env: { FLARELOG_API_KEY: "fl_from_hono_env" },
    });
    const mw = honoMiddleware();

    await mw(ctx, vi.fn().mockResolvedValue(undefined));

    // The auto-logger should have resolved the API key from c.env and shipped
    // the log to the Flarelog transport (URL ends in /v1/logs).
    expect(wasFetchCalledForUrl(fetchMock, "/v1/logs")).toBe(true);
  });

  it("falls back to process.env when c.env has no FLARELOG_API_KEY", async () => {
    process.env.FLARELOG_API_KEY = "fl_from_process_env";
    const ctx = makeContext({ env: {} });
    const mw = honoMiddleware();

    await mw(ctx, vi.fn().mockResolvedValue(undefined));

    expect(wasFetchCalledForUrl(fetchMock, "/v1/logs")).toBe(true);

    delete process.env.FLARELOG_API_KEY;
  });

  it("falls back to process.env when c.env is undefined (Hono on Node)", async () => {
    process.env.FLARELOG_API_KEY = "fl_from_process_env";
    const ctx = makeContext(); // no env property
    const mw = honoMiddleware();

    await mw(ctx, vi.fn().mockResolvedValue(undefined));

    expect(wasFetchCalledForUrl(fetchMock, "/v1/logs")).toBe(true);

    delete process.env.FLARELOG_API_KEY;
  });

  it("caches the auto-logger across requests within the same middleware instance", async () => {
    const ctx = makeContext({
      env: { FLARELOG_API_KEY: "fl_cached" },
    });
    const mw = honoMiddleware();

    await mw(ctx, vi.fn().mockResolvedValue(undefined));
    await mw(ctx, vi.fn().mockResolvedValue(undefined));

    // Both requests should flow through; the cache prevents re-instantiating
    // the logger on every request.
    const logCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/v1/logs"),
    );
    expect(logCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("factory mode can read c.env for multi-tenant keys", async () => {
    const ctx1 = makeContext({
      env: { TENANT_A_KEY: "fl_tenant_a" },
    });
    const ctx2 = makeContext({
      env: { TENANT_B_KEY: "fl_tenant_b" },
    });

    const factory = (c: HonoContextStub) =>
      new FlareLog({
        apiKey: c.env?.TENANT_A_KEY ?? c.env?.TENANT_B_KEY ?? "",
        endpoint: "http://localhost:9999",
        allowInsecure: true,
        workerMode: true,
      });

    const mw = honoMiddleware(factory);

    await mw(ctx1, vi.fn().mockResolvedValue(undefined));
    await mw(ctx2, vi.fn().mockResolvedValue(undefined));

    // Factory is invoked per request, so two different loggers were created.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
