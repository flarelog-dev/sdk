import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import {
  extractOtlpLogs,
  extractOtlpSpans,
  getLogCalls,
  getTraceCalls,
  mockFetch,
  attrsToObject,
} from "./helpers";
import {
  withFlareLog,
  withNextRouteHandler,
  withNextMiddleware,
} from "../src/frameworks/next";

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

/**
 * Minimal fake Next.js Pages Router response for unit tests.
 */
function createResponse(initialStatus = 200) {
  const listeners: Record<string, (() => void)[]> = {};
  const res = {
    statusCode: initialStatus,
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json() {
      this.headersSent = true;
      this.emit("finish");
      return this;
    },
    send() {
      this.headersSent = true;
      this.emit("finish");
      return this;
    },
    end() {
      this.headersSent = true;
      this.emit("finish");
      return this;
    },
    setHeader() {
      return this;
    },
    getHeader() {
      return undefined;
    },
    on(event: "finish" | "close", cb: () => void) {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    },
    emit(event: "finish" | "close") {
      listeners[event]?.forEach((cb) => cb());
    },
  };
  return res;
}

function getAllLogs(fetchMock: ReturnType<typeof vi.fn>) {
  return getLogCalls(fetchMock).flatMap((body) =>
    body ? extractOtlpLogs(body) : []
  );
}

function getLastLogs(fetchMock: ReturnType<typeof vi.fn>) {
  const calls = getLogCalls(fetchMock);
  const body = calls[calls.length - 1];
  return body ? extractOtlpLogs(body) : [];
}

function getLastSpans(fetchMock: ReturnType<typeof vi.fn>) {
  const calls = getTraceCalls(fetchMock);
  const body = calls[calls.length - 1];
  return body ? extractOtlpSpans(body) : [];
}

describe("withFlareLog (Pages Router API routes)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts x-trace-id header and attaches logger/traceId", async () => {
    const logger = makeLogger();
    const wrapped = withFlareLog(logger, async (req, res) => {
      expect(req.traceId).toBe("trace-abc");
      expect(typeof req.logger.info).toBe("function");
      res.status(200).json({ ok: true });
    });
    const res = createResponse();

    await wrapped(
      { headers: { "x-trace-id": "trace-abc" }, method: "GET", url: "/api/test" } as any,
      res as any
    );

    const logs = getAllLogs(fetchMock);
    const completed = logs.find((l) =>
      l.body?.stringValue?.includes("completed")
    );
    expect(completed?.severityText).toBe("INFO");
    expect(attrsToObject(completed?.attributes).traceId).toBe("trace-abc");
  });

  it("falls back to W3C traceparent when x-trace-id is absent", async () => {
    const logger = makeLogger();
    const wrapped = withFlareLog(logger, async (_req, res) => {
      res.status(200).json({ ok: true });
    });
    const res = createResponse();
    const traceId = "0af7651916cd43dd8448eb211c80319c";

    await wrapped(
      {
        headers: { traceparent: `00-${traceId}-b7ad6b7169203331-01` },
        method: "GET",
        url: "/api/test",
      } as any,
      res as any
    );

    const logs = getAllLogs(fetchMock);
    const completed = logs.find((l) =>
      l.body?.stringValue?.includes("completed")
    );
    expect(attrsToObject(completed?.attributes).traceId).toBe(traceId);
  });

  it("auto-generates a traceId when no trace header is present", async () => {
    const logger = makeLogger();
    const wrapped = withFlareLog(logger, async (_req, res) => {
      res.status(200).json({ ok: true });
    });
    const res = createResponse();

    await wrapped(
      { headers: {}, method: "GET", url: "/api/test" } as any,
      res as any
    );

    const logs = getAllLogs(fetchMock);
    const completed = logs.find((l) =>
      l.body?.stringValue?.includes("completed")
    );
    expect(attrsToObject(completed?.attributes).traceId).toBeTruthy();
    expect(typeof attrsToObject(completed?.attributes).traceId).toBe("string");
  });

  it("maps 4xx responses to WARN", async () => {
    const logger = makeLogger();
    const wrapped = withFlareLog(logger, async (_req, res) => {
      res.status(404).json({ error: "not found" });
    });
    const res = createResponse();

    await wrapped(
      { headers: {}, method: "GET", url: "/api/test" } as any,
      res as any
    );

    const logs = getAllLogs(fetchMock);
    const completed = logs.find((l) =>
      l.body?.stringValue?.includes("completed")
    );
    expect(completed?.severityText).toBe("WARN");
  });

  it("maps 5xx responses to ERROR", async () => {
    const logger = makeLogger();
    const wrapped = withFlareLog(logger, async (_req, res) => {
      res.status(503).json({ error: "unavailable" });
    });
    const res = createResponse();

    await wrapped(
      { headers: {}, method: "GET", url: "/api/test" } as any,
      res as any
    );

    const logs = getAllLogs(fetchMock);
    const completed = logs.find((l) =>
      l.body?.stringValue?.includes("completed")
    );
    expect(completed?.severityText).toBe("ERROR");
  });

  it("logs errors, sends 500, and rethrows when handler throws", async () => {
    const logger = makeLogger();
    const wrapped = withFlareLog(logger, async () => {
      throw new Error("boom");
    });
    const res = createResponse();

    await expect(
      wrapped(
        { headers: {}, method: "GET", url: "/api/test" } as any,
        res as any
      )
    ).rejects.toThrow("boom");

    expect(res.statusCode).toBe(500);
    expect(res.headersSent).toBe(true);

    const logs = getAllLogs(fetchMock);
    const failed = logs.find((l) => l.body?.stringValue?.includes("failed"));
    expect(failed?.severityText).toBe("ERROR");
  });

  it("rethrows without overwriting response when headers already sent", async () => {
    const logger = makeLogger();
    const wrapped = withFlareLog(logger, async (_req, res) => {
      res.status(200).json({ ok: true });
      throw new Error("late boom");
    });
    const res = createResponse();

    await expect(
      wrapped(
        { headers: {}, method: "GET", url: "/api/test" } as any,
        res as any
      )
    ).rejects.toThrow("late boom");

    expect(res.statusCode).toBe(200);
    expect(res.headersSent).toBe(true);
  });
});

describe("withNextRouteHandler (App Router)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a SPAN_KIND_SERVER span", async () => {
    const logger = makeLogger();
    const handler = withNextRouteHandler(logger, async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const response = await handler(makeRequest());
    expect(response.status).toBe(200);

    const spans = getLastSpans(fetchMock);
    expect(spans.length).toBeGreaterThanOrEqual(1);
    const serverSpan = spans.find((s) => s.name === "GET /api/test");
    expect(serverSpan).toBeDefined();
    expect(serverSpan?.kind).toBe(2); // SPAN_KIND_SERVER
    const attrs = attrsToObject(serverSpan?.attributes);
    expect(attrs["http.request.method"]).toBe("GET");
    expect(attrs["url.path"]).toBe("/api/test");
    expect(attrs["http.response.status_code"]).toBe(200);
  });

  it("extracts W3C traceparent", async () => {
    const logger = makeLogger();
    const traceId = "0af7651916cd43dd8448eb211c80319c";
    const handler = withNextRouteHandler(logger, async () => new Response("ok"));

    await handler(
      makeRequest({ traceparent: `00-${traceId}-b7ad6b7169203331-01` })
    );

    const spans = getLastSpans(fetchMock);
    expect(spans[0].traceId).toBe(traceId);
  });

  it("records exceptions and rethrows on handler error", async () => {
    const logger = makeLogger();
    const handler = withNextRouteHandler(logger, async () => {
      throw new Error("app router boom");
    });

    await expect(handler(makeRequest())).rejects.toThrow("app router boom");

    const spans = getLastSpans(fetchMock);
    const errorSpan = spans.find((s) => s.name === "GET /api/test");
    expect(errorSpan).toBeDefined();
    expect(errorSpan?.status?.code).toBe(2); // ERROR
    const attrs = attrsToObject(errorSpan?.attributes);
    expect(attrs["http.response.status_code"]).toBe(500);
  });
});

describe("withNextMiddleware (Edge Middleware)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the handler's Response unchanged and emits a span", async () => {
    const logger = makeLogger();
    const nextResponse = new Response(null, { status: 200 });
    const handler = withNextMiddleware(logger, async () => nextResponse);

    const result = await handler(makeRequest());
    expect(result).toBe(nextResponse);

    const spans = getLastSpans(fetchMock);
    expect(spans.length).toBeGreaterThanOrEqual(1);
    expect(spans.some((s) => s.name === "GET /api/test")).toBe(true);
  });

  it("logs errors and rethrows on handler error", async () => {
    const logger = makeLogger();
    const handler = withNextMiddleware(logger, async () => {
      throw new Error("middleware boom");
    });

    await expect(handler(makeRequest())).rejects.toThrow("middleware boom");

    const spans = getLastSpans(fetchMock);
    const span = spans.find((s) => s.name === "GET /api/test");
    expect(span?.status?.code).toBe(2); // ERROR
  });
});
