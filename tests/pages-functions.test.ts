import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { pagesFunction } from "../src/frameworks/cf-workers";
import {
  extractOtlpLogs,
  extractOtlpSpans,
  attrsToObject,
  getLogCalls,
  getTraceCalls,
  mockFetch,
} from "./helpers";

function createLogger() {
  return new FlareLog({
    apiKey: "test",
    workerMode: true,
  });
}

async function flushAndGetLogs(logger: FlareLog, fetchMock: ReturnType<typeof vi.fn>) {
  await logger.flush();
  const logCalls = getLogCalls(fetchMock);
  const all: ReturnType<typeof extractOtlpLogs> = [];
  for (const body of logCalls) all.push(...extractOtlpLogs(body));
  return all.map((l) => ({
    level: l.severityText ?? "INFO",
    message: l.body?.stringValue ?? "",
    metadata: attrsToObject(l.attributes),
    traceId: l.traceId,
    spanId: l.spanId,
  }));
}

async function flushAndGetSpans(logger: FlareLog, fetchMock: ReturnType<typeof vi.fn>) {
  await logger.flush();
  const traceCalls = getTraceCalls(fetchMock);
  const all: ReturnType<typeof extractOtlpSpans> = [];
  for (const body of traceCalls) all.push(...extractOtlpSpans(body));
  return all.map((s) => ({
    name: s.name,
    kind: s.kind,
    status: s.status,
    attributes: attrsToObject(s.attributes),
    traceId: s.traceId,
    spanId: s.spanId,
  }));
}

describe("pagesFunction (Cloudflare Pages Functions)", () => {
  let logger: FlareLog;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logger = createLogger();
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    logger.destroy();
    vi.restoreAllMocks();
  });

  function createPagesContext(overrides?: Partial<{
    request: Request;
    env: Record<string, unknown>;
    waitUntil: (promise: Promise<unknown>) => void;
    next: () => Promise<Response>;
    data: Record<string, unknown>;
    params: Record<string, string>;
  }>) {
    return {
      request: new Request("https://example.com/api/users"),
      env: { FLARELOG_API_KEY: "test" },
      waitUntil: vi.fn(),
      next: vi.fn().mockResolvedValue(new Response("next", { status: 200 })),
      data: {},
      params: {},
      ...overrides,
    };
  }

  it("creates a SPAN_KIND_SERVER span for each Pages Function call", async () => {
    const handler = pagesFunction(logger, async (context) => {
      return new Response("ok", { status: 200 });
    });
    const context = createPagesContext();

    const response = await handler(context);
    expect(response.status).toBe(200);

    const spans = await flushAndGetSpans(logger, fetchMock);
    expect(spans.length).toBeGreaterThanOrEqual(1);
    const serverSpan = spans.find((s) => s.name === "GET /api/users");
    expect(serverSpan).toBeDefined();
    expect(serverSpan?.kind).toBe(2); // SPAN_KIND_SERVER
    expect(serverSpan?.attributes["http.request.method"]).toBe("GET");
    expect(serverSpan?.attributes["url.path"]).toBe("/api/users");
    expect(serverSpan?.attributes["http.response.status_code"]).toBe(200);
    expect(context.waitUntil).toHaveBeenCalled();
  });

  it("records exceptions on the span when the handler throws", async () => {
    const handler = pagesFunction(logger, async (context) => {
      throw new Error("pages boom");
    });
    const context = createPagesContext({
      request: new Request("https://example.com/api/users", {
        headers: { "x-trace-id": "abc" },
      }),
    });

    await expect(handler(context)).rejects.toThrow("pages boom");

    const spans = await flushAndGetSpans(logger, fetchMock);
    const errorSpan = spans.find((s) => s.name === "GET /api/users");
    expect(errorSpan).toBeDefined();
    expect(errorSpan?.status?.code).toBe(2); // ERROR
    expect(errorSpan?.attributes["http.response.status_code"]).toBe(500);
    expect(context.waitUntil).toHaveBeenCalled();
  });

  it("extracts W3C traceparent from incoming headers", async () => {
    const traceId = "0af7651916cd43dd8448eb211c80319c";
    const spanId = "b7ad6b7169203331";
    const handler = pagesFunction(logger, async (context) => {
      return new Response("ok");
    });
    const context = createPagesContext({
      request: new Request("https://example.com/", {
        headers: { traceparent: `00-${traceId}-${spanId}-01` },
      }),
    });

    await handler(context);

    const spans = await flushAndGetSpans(logger, fetchMock);
    expect(spans[0].traceId).toBe(traceId);
    expect(spans[0].attributes["http.request.method"]).toBe("GET");
  });

  it("logs emitted inside the handler carry the active span's traceId", async () => {
    const handler = pagesFunction(logger, async (context) => {
      logger.info("inside pages handler");
      return new Response("ok");
    });
    const context = createPagesContext();

    await handler(context);

    const spans = await flushAndGetSpans(logger, fetchMock);
    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(spans.length).toBeGreaterThanOrEqual(1);
    expect(logs.some((l) => l.message === "inside pages handler")).toBe(true);
    // The log's traceId should match the span's traceId (log-to-trace correlation)
    const handlerLog = logs.find((l) => l.message === "inside pages handler");
    expect(handlerLog?.traceId).toBe(spans[0].traceId);
  });

  it("passes the full context object to the handler", async () => {
    const handler = pagesFunction(logger, async (context) => {
      expect(context.env).toBeDefined();
      expect(context.env.FLARELOG_API_KEY).toBe("test");
      expect(context.params).toBeDefined();
      expect(context.data).toBeDefined();
      expect(context.next).toBeDefined();
      return new Response("ok", { status: 200 });
    });
    const context = createPagesContext({
      params: { id: "123" },
      data: { user: "test" },
    });

    const response = await handler(context);
    expect(response.status).toBe(200);
  });

  it("works with middleware pattern (context.next)", async () => {
    const handler = pagesFunction(logger, async (context) => {
      logger.info("middleware running");
      return context.next();
    });
    const context = createPagesContext();

    const response = await handler(context);
    expect(response.status).toBe(200);
    expect(context.next).toHaveBeenCalled();

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs.some((l) => l.message === "middleware running")).toBe(true);
  });

  it("degrades gracefully when waitUntil is missing", async () => {
    const handler = pagesFunction(logger, async (context) => {
      return new Response("ok", { status: 200 });
    });
    const context = createPagesContext({ waitUntil: undefined as any });

    const response = await handler(context);
    expect(response.status).toBe(200);

    // Should still flush via the blocking fallback
    const spans = await flushAndGetSpans(logger, fetchMock);
    expect(spans.length).toBeGreaterThanOrEqual(1);
    expect(spans[0].attributes["http.response.status_code"]).toBe(200);
  });

  it("degrades gracefully when waitUntil is missing on error", async () => {
    const handler = pagesFunction(logger, async (context) => {
      throw new Error("boom");
    });
    const context = createPagesContext({ waitUntil: undefined as any });

    await expect(handler(context)).rejects.toThrow("boom");

    const spans = await flushAndGetSpans(logger, fetchMock);
    expect(spans[0].status?.code).toBe(2); // ERROR
  });

  it("handles dynamic route params", async () => {
    const handler = pagesFunction(logger, async (context) => {
      logger.info("Fetching user", { userId: context.params?.id });
      return new Response(`User ${context.params?.id}`, { status: 200 });
    });
    const context = createPagesContext({
      request: new Request("https://example.com/api/users/123"),
      params: { id: "123" },
    });

    const response = await handler(context);
    expect(response.status).toBe(200);

    const logs = await flushAndGetLogs(logger, fetchMock);
    const userLog = logs.find((l) => l.message === "Fetching user");
    expect(userLog).toBeDefined();
    expect(userLog?.metadata?.userId).toBe("123");
  });
});
