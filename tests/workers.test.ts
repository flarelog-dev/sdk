import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { wrapWorker } from "../src/workers";
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

describe("worker capture (v2 — OTel-native)", () => {
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

  it("creates a SPAN_KIND_SERVER span for each fetch handler call", async () => {
    const handler = logger.workerFetch(async () => new Response("ok", { status: 200 }));
    const request = new Request("https://example.com/api/users");
    const ctx = { waitUntil: vi.fn() };

    const response = await handler(request, {}, ctx);
    expect(response.status).toBe(200);

    const spans = await flushAndGetSpans(logger, fetchMock);
    expect(spans.length).toBeGreaterThanOrEqual(1);
    const serverSpan = spans.find((s) => s.name === "GET /api/users");
    expect(serverSpan).toBeDefined();
    expect(serverSpan?.kind).toBe(2); // SPAN_KIND_SERVER
    expect(serverSpan?.attributes["http.request.method"]).toBe("GET");
    expect(serverSpan?.attributes["url.path"]).toBe("/api/users");
    expect(serverSpan?.attributes["http.response.status_code"]).toBe(200);
    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it("records exceptions on the span when the handler throws", async () => {
    const handler = logger.workerFetch(async () => {
      throw new Error("worker boom");
    });
    const request = new Request("https://example.com/api/users", {
      headers: { "x-trace-id": "abc" },
    });
    const ctx = { waitUntil: vi.fn() };

    await expect(handler(request, {}, ctx)).rejects.toThrow("worker boom");

    const spans = await flushAndGetSpans(logger, fetchMock);
    const errorSpan = spans.find((s) => s.name === "GET /api/users");
    expect(errorSpan).toBeDefined();
    expect(errorSpan?.status?.code).toBe(2); // ERROR
    expect(errorSpan?.attributes["http.response.status_code"]).toBe(500);
    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it("extracts W3C traceparent from incoming headers", async () => {
    const traceId = "0af7651916cd43dd8448eb211c80319c";
    const spanId = "b7ad6b7169203331";
    const handler = logger.workerFetch(async () => new Response("ok"));
    const request = new Request("https://example.com/", {
      headers: { traceparent: `00-${traceId}-${spanId}-01` },
    });
    const ctx = { waitUntil: vi.fn() };

    await handler(request, {}, ctx);

    const spans = await flushAndGetSpans(logger, fetchMock);
    expect(spans[0].traceId).toBe(traceId);
    expect(spans[0].attributes["http.request.method"]).toBe("GET");
  });

  it("logs emitted inside the handler carry the active span's traceId", async () => {
    const handler = logger.workerFetch(async () => {
      logger.info("inside handler");
      return new Response("ok");
    });
    const request = new Request("https://example.com/");
    const ctx = { waitUntil: vi.fn() };

    await handler(request, {}, ctx);

    const spans = await flushAndGetSpans(logger, fetchMock);
    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(spans.length).toBeGreaterThanOrEqual(1);
    expect(logs.some((l) => l.message === "inside handler")).toBe(true);
    // The log's traceId should match the span's traceId (log-to-trace correlation)
    const handlerLog = logs.find((l) => l.message === "inside handler");
    expect(handlerLog?.traceId).toBe(spans[0].traceId);
  });

  it("degrades gracefully when ctx.waitUntil is missing", async () => {
    const handler = logger.workerFetch(async () => new Response("ok", { status: 200 }));
    const request = new Request("https://example.com/health");
    const ctx = {}; // no waitUntil

    const response = await handler(request, {}, ctx);
    expect(response.status).toBe(200);

    // Should still flush via the blocking fallback
    const spans = await flushAndGetSpans(logger, fetchMock);
    expect(spans.length).toBeGreaterThanOrEqual(1);
    expect(spans[0].attributes["http.response.status_code"]).toBe(200);
  });

  it("degrades gracefully when ctx.waitUntil is missing on error", async () => {
    const handler = logger.workerFetch(async () => {
      throw new Error("boom");
    });
    const request = new Request("https://example.com/");
    const ctx = {};

    await expect(handler(request, {}, ctx)).rejects.toThrow("boom");

    const spans = await flushAndGetSpans(logger, fetchMock);
    expect(spans[0].status?.code).toBe(2); // ERROR
  });

  it("captures Web Worker errors", async () => {
    class FakeWorker extends EventTarget {
      constructor(_scriptURL: string | URL, _options?: WorkerOptions) {
        super();
      }
    }

    class FakeErrorEvent extends Event {
      error: unknown;
      constructor(type: string, init: { error: unknown }) {
        super(type);
        this.error = init.error;
      }
    }

    const Wrapped = wrapWorker(logger, FakeWorker as unknown as typeof Worker);
    const worker = new Wrapped("blob://fake");
    worker.dispatchEvent(new FakeErrorEvent("error", { error: new Error("worker err") }));

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs.some((l) => l.message === "Worker error")).toBe(true);
  });
});
