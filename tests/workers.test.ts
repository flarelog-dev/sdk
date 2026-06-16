import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { wrapWorker } from "../src/workers";

function createLogger() {
  return new FlareLog({
    apiKey: "test",
    project: "test",
    batchSize: 100,
    flushIntervalMs: 10000,
  });
}

function mockFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    text: async () => "",
    json: async () => ({ result: { data: { success: true, ingested: 0 } } }),
  });
}

async function flushAndGetLogs(logger: FlareLog, fetchMock: ReturnType<typeof vi.fn>) {
  await logger.flush();
  const calls = fetchMock.mock.calls;
  if (calls.length === 0) return [];
  const body = JSON.parse(calls[calls.length - 1][1].body);
  return body.logs as Array<{
    level: string;
    message: string;
    source?: string;
    metadata?: Record<string, unknown>;
  }>;
}

describe("worker capture", () => {
  let logger: FlareLog;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logger = createLogger();
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    logger.destroy();
    vi.restoreAllMocks();
  });

  it("wraps fetch handlers and captures errors", async () => {
    const handler = logger.workerFetch(async () => {
      throw new Error("worker boom");
    });

    const request = new Request("https://example.com/api/users", {
      headers: { "x-trace-id": "abc" },
    });
    const ctx = { waitUntil: vi.fn() };

    await expect(handler(request, {}, ctx)).rejects.toThrow("worker boom");

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs.some((l) => l.message === "Worker request failed")).toBe(true);
    expect(logs.some((l) => l.metadata?.traceId === "abc")).toBe(true);
    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it("logs successful fetch handler completion", async () => {
    const handler = logger.workerFetch(async () => new Response("ok", { status: 200 }));

    const request = new Request("https://example.com/health");
    const ctx = { waitUntil: vi.fn() };

    const response = await handler(request, {}, ctx);
    expect(response.status).toBe(200);

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs.some((l) => l.message === "Worker request completed")).toBe(true);
    expect(logs.some((l) => (l.metadata?.status as number) === 200)).toBe(true);
  });

  it("falls back to random trace id when header is absent", async () => {
    const handler = logger.workerFetch(async () => new Response("ok"));

    const request = new Request("https://example.com/");
    const ctx = { waitUntil: vi.fn() };

    await handler(request, {}, ctx);
    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs.some((l) => typeof l.metadata?.traceId === "string")).toBe(true);
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
