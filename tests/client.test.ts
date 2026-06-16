import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";

function createLogger(config: Record<string, unknown> = {}) {
  return new FlareLog({
    apiKey: "test",
    project: "test",
    batchSize: 100,
    flushIntervalMs: 10000,
    ...config,
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

describe("FlareLog core", () => {
  let logger: FlareLog;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    logger?.destroy();
    vi.restoreAllMocks();
  });

  it("logs levels and batches them", async () => {
    logger = createLogger();
    logger.info("hello", { foo: "bar" });
    logger.error("oops");

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs).toHaveLength(2);
    expect(logs[0].level).toBe("INFO");
    expect(logs[1].level).toBe("ERROR");
  });

  it("captures async errors and rethrows by default", async () => {
    logger = createLogger();
    await expect(
      logger.capture(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs.some((l) => l.message === "boom")).toBe(true);
  });

  it("creates child loggers with merged metadata", async () => {
    logger = createLogger();
    const child = logger.child({ source: "child", requestId: "123" });
    child.info("child log", { extra: true });

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs[0].source).toBe("child");
    expect(logs[0].metadata).toMatchObject({
      requestId: "123",
      extra: true,
    });
  });

  it("serializes error cause chains", async () => {
    logger = createLogger();
    const root = new Error("root");
    const err = new Error("outer", { cause: root });

    logger.logError(err);
    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs[0].metadata).toMatchObject({
      error: expect.objectContaining({
        message: "outer",
        cause: expect.objectContaining({ message: "root" }),
      }),
    });
  });

  it("installs console hooks via autoCapture config", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    logger = createLogger({
      autoCapture: { console: true },
    });

    console.error("auto captured");
    const logs = await flushAndGetLogs(logger, fetchMock);

    expect(logs.some((l) => l.message === "auto captured")).toBe(true);
  });

  it("installs and removes global handlers", () => {
    logger = createLogger();
    const before = process.listenerCount("unhandledRejection");

    const cleanup = logger.installGlobalHandlers({ errors: false, rejections: true });
    expect(process.listenerCount("unhandledRejection")).toBe(before + 1);

    cleanup();
    expect(process.listenerCount("unhandledRejection")).toBe(before);
  });
});
