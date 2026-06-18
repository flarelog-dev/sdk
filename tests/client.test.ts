import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";

function createLogger(config: Record<string, unknown> = {}) {
  return new FlareLog({
    apiKey: "test",
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

describe("FlareLog user context", () => {
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

  it("sets user context and includes it in logs", async () => {
    logger = createLogger();
    logger.setUser({ id: "user_123", email: "test@example.com" });
    logger.info("user action");

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs[0].metadata).toMatchObject({
      user: { id: "user_123", email: "test@example.com" },
    });
  });

  it("clears user context when set to null", async () => {
    logger = createLogger();
    logger.setUser({ id: "user_123" });
    logger.setUser(null);
    logger.info("no user");

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs[0].metadata?.user).toBeUndefined();
  });
});

describe("FlareLog breadcrumbs", () => {
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

  it("adds breadcrumbs and includes them in error logs", async () => {
    logger = createLogger();
    logger.addBreadcrumb({
      category: "navigation",
      message: "User navigated to /checkout",
    });
    logger.addBreadcrumb({
      category: "ui.click",
      message: "Click on button",
    });

    logger.logError(new Error("payment failed"));

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs[0].metadata?.breadcrumbs).toHaveLength(2);
    expect(logs[0].metadata?.breadcrumbs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "navigation", message: "User navigated to /checkout" }),
        expect.objectContaining({ category: "ui.click", message: "Click on button" }),
      ])
    );
  });

  it("limits breadcrumbs to last 50 in error logs", async () => {
    logger = createLogger();
    for (let i = 0; i < 60; i++) {
      logger.addBreadcrumb({
        category: "test",
        message: `Breadcrumb ${i}`,
      });
    }

    logger.logError(new Error("error"));

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs[0].metadata?.breadcrumbs).toHaveLength(50);
  });
});

describe("FlareLog tags", () => {
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

  it("sets tags and includes them in logs", async () => {
    logger = createLogger();
    logger.setTag("version", "1.2.3");
    logger.setTag("feature", "new-checkout");
    logger.info("tagged log");

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs[0].metadata).toMatchObject({
      tags: { version: "1.2.3", feature: "new-checkout" },
    });
  });
});

describe("FlareLog environment config", () => {
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

  it("includes environment metadata in logs", async () => {
    logger = createLogger({
      environment: "production",
      release: "v1.2.3",
      serverName: "worker-1",
    });
    logger.info("env log");

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs[0].metadata).toMatchObject({
      environment: "production",
      release: "v1.2.3",
      serverName: "worker-1",
    });
  });
});

describe("FlareLog beforeSend hook", () => {
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

  it("allows modifying logs before send", async () => {
    logger = createLogger({
      beforeSend: (log) => ({
        ...log,
        message: `[MODIFIED] ${log.message}`,
      }),
    });
    logger.info("original");

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs[0].message).toBe("[MODIFIED] original");
  });

  it("allows dropping logs by returning false", async () => {
    logger = createLogger({
      beforeSend: () => false,
    });
    logger.info("dropped");

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs).toHaveLength(0);
  });
});

describe("FlareLog sample rate", () => {
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

  it("drops logs based on sample rate", async () => {
    logger = createLogger({
      sampleRate: 0,
    });
    logger.info("should not appear");

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs).toHaveLength(0);
  });
});
