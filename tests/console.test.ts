import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { runWithHookSkipped } from "../src/console";

function createLogger() {
  return new FlareLog({
    apiKey: "test",
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

describe("console hooks", () => {
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

  it("captures console.error as an ERROR log", async () => {
    const original = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.installConsoleHooks();

    console.error("Something broke", { detail: 123 });

    expect(original).toHaveBeenCalledWith("Something broke", { detail: 123 });

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe("ERROR");
    expect(logs[0].message).toBe("Something broke");
    expect(logs[0].source).toBe("console");
    expect(logs[0].metadata).toMatchObject({ consoleLevel: "error" });
  });

  it("captures console.warn as a WARN log", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.installConsoleHooks();

    console.warn("low disk");
    const logs = await flushAndGetLogs(logger, fetchMock);

    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe("WARN");
    expect(logs[0].message).toBe("low disk");
  });

  it("deduplicates repeated identical console messages", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    logger.installConsoleHooks();

    console.error("same");
    console.error("same");
    console.error("same");

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs).toHaveLength(1);
  });

  it("does not capture output from runWithHookSkipped", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    logger.installConsoleHooks();

    console.error("captured");
    runWithHookSkipped(() => {
      console.error("skipped");
    });

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe("captured");
  });

  it("forwards Error objects in console args", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    logger.installConsoleHooks();

    const err = new Error("nested");
    console.error("failed", err);

    const logs = await flushAndGetLogs(logger, fetchMock);
    expect(logs[0].metadata).toMatchObject({
      error: expect.objectContaining({ message: "nested" }),
    });
  });
});
