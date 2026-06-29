/**
 * Unit tests for the Express middleware integration.
 *
 * Express's `(req, res, next)` signature hasn't changed since 2014, so the
 * inline stubs here are extremely unlikely to drift. The tests cover:
 *   - traceId extraction from headers + auto-generation
 *   - child logger attachment to req
 *   - status-code → log-level mapping via res.on("finish")
 *   - error handler logs + sends 500
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { mockFetch, wasFetchCalledForUrl } from "./helpers";
import {
  expressMiddleware,
  expressErrorHandler,
} from "../src/frameworks/express";

// ─── Inline Express stubs ──────────────────────────────────────────────────
// Mirror the real `express.Request` / `express.Response` shape closely enough
// for the middleware to exercise its full code path. No `vi.mock("express")`
// needed — the SDK doesn't import express at all (it uses inline types).

interface FakeRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  path: string;
  ip?: string;
  logger?: unknown;
  traceId?: string;
}

interface FakeResponse {
  statusCode: number;
  listeners: Record<string, Array<() => void>>;
  on(event: string, cb: () => void): void;
  emit(event: string): void;
  json: (data: unknown) => FakeResponse;
}

function makeRequest(
  overrides: Partial<FakeRequest> = {},
): FakeRequest {
  return {
    headers: {},
    method: "GET",
    path: "/api/test",
    ...overrides,
  };
}

function makeResponse(initialStatus = 200): FakeResponse {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    statusCode: initialStatus,
    listeners,
    on(event: string, cb: () => void) {
      (listeners[event] ??= []).push(cb);
      return this as never;
    },
    emit(event: string) {
      (listeners[event] ?? []).forEach((cb) => cb());
    },
    json(data: unknown) {
      this.emit("finish");
      return this;
    },
  };
}

function makeLogger() {
  return new FlareLog({
    apiKey: "test-key",
    endpoint: "http://localhost:9999",
    allowInsecure: true,
    workerMode: true,
  });
}

describe("expressMiddleware", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches a child logger and traceId to req", () => {
    const logger = makeLogger();
    const middleware = expressMiddleware(logger);
    const req = makeRequest({ headers: { "x-trace-id": "trace-123" } });
    const res = makeResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.traceId).toBe("trace-123");
    expect(req.logger).toBeDefined();
    expect(typeof (req.logger as { info?: unknown }).info).toBe("function");
  });

  it("auto-generates a traceId when the header is missing", () => {
    const logger = makeLogger();
    const middleware = expressMiddleware(logger);
    const req = makeRequest();
    const res = makeResponse();

    middleware(req, res, vi.fn());

    expect(req.traceId).toBeTruthy();
    expect(typeof req.traceId).toBe("string");
    // UUID v4 format
    expect(req.traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("logs request completion at INFO for 2xx status", () => {
    const logger = makeLogger();
    const logSpy = vi.spyOn(logger, "log").mockImplementation(() => {});
    const middleware = expressMiddleware(logger);
    const req = makeRequest();
    const res = makeResponse(200);

    middleware(req, res, vi.fn());
    res.emit("finish");

    expect(logSpy).toHaveBeenCalledWith(
      "INFO",
      "Request completed",
      expect.objectContaining({ status: 200 }),
      expect.anything(),
    );
  });

  it("logs request completion at WARN for 4xx status", () => {
    const logger = makeLogger();
    const logSpy = vi.spyOn(logger, "log").mockImplementation(() => {});
    const middleware = expressMiddleware(logger);
    const req = makeRequest();
    const res = makeResponse(404);

    middleware(req, res, vi.fn());
    res.emit("finish");

    expect(logSpy).toHaveBeenCalledWith(
      "WARN",
      "Request completed",
      expect.objectContaining({ status: 404 }),
      expect.anything(),
    );
  });

  it("logs request completion at ERROR for 5xx status", () => {
    const logger = makeLogger();
    const logSpy = vi.spyOn(logger, "log").mockImplementation(() => {});
    const middleware = expressMiddleware(logger);
    const req = makeRequest();
    const res = makeResponse(500);

    middleware(req, res, vi.fn());
    res.emit("finish");

    expect(logSpy).toHaveBeenCalledWith(
      "ERROR",
      "Request completed",
      expect.objectContaining({ status: 500 }),
      expect.anything(),
    );
  });

  it("includes method, path, and ip in the child logger context", () => {
    const logger = makeLogger();
    const childSpy = vi.spyOn(logger, "child");
    const middleware = expressMiddleware(logger);
    const req = makeRequest({
      method: "POST",
      path: "/api/users",
      ip: "203.0.113.42",
      headers: { "x-trace-id": "t1" },
    });
    const res = makeResponse();

    middleware(req, res, vi.fn());

    expect(childSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "express",
        method: "POST",
        path: "/api/users",
        ip: "203.0.113.42",
        traceId: "t1",
      }),
    );
  });

  it("calls next() so the request continues down the middleware chain", () => {
    const logger = makeLogger();
    const middleware = expressMiddleware(logger);
    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // no args = no error
  });
});

describe("expressErrorHandler", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the error via req.logger.logError", () => {
    const logger = makeLogger();
    const handler = expressErrorHandler(logger);
    const req = makeRequest({
      headers: { "x-trace-id": "err-trace" },
    });
    // Simulate the request middleware having run first
    expressMiddleware(logger)(req as never, makeResponse() as never, vi.fn());
    const res = makeResponse();
    const logErrorSpy = vi
      .spyOn(req.logger as { logError: (e: unknown, o?: unknown) => void }, "logError")
      .mockImplementation(() => {});

    const err = new Error("Something broke");
    handler(err, req as never, res as never, vi.fn());

    expect(logErrorSpy).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        message: "Express error",
        metadata: expect.objectContaining({ path: "/api/test", method: "GET" }),
      }),
    );
  });

  it("sets statusCode to 500 and sends a JSON error response", () => {
    const logger = makeLogger();
    const handler = expressErrorHandler(logger);
    const req = makeRequest();
    expressMiddleware(logger)(req as never, makeResponse() as never, vi.fn());
    const res = makeResponse();
    // The real Express res.json() is chained — our stub returns `this`.
    // The handler calls `res.json({ error: "Internal server error" })`.
    const jsonSpy = vi.spyOn(res, "json");

    handler(new Error("boom"), req as never, res as never, vi.fn());

    expect(res.statusCode).toBe(500);
    expect(jsonSpy).toHaveBeenCalledWith({ error: "Internal server error" });
  });

  it("does not crash when req.logger is undefined (no middleware ran)", () => {
    const logger = makeLogger();
    const handler = expressErrorHandler(logger);
    const req = makeRequest(); // no logger attached
    const res = makeResponse();

    // Should not throw — just sets 500 and sends JSON
    expect(() => {
      handler(new Error("no logger"), req as never, res as never, vi.fn());
    }).not.toThrow();
    expect(res.statusCode).toBe(500);
  });
});
