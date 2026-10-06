import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { ConsoleTransport } from "../src/otel/console-transport";

/**
 * A stdio MCP server speaks JSON-RPC over stdout. Anything else written there
 * (such as the SDK's own console fallback) corrupts the stream, and the client
 * reports a cryptic parse error. `logToStderr` keeps stdout clean.
 */
describe("ConsoleTransport stderr mode", () => {
  let log: ReturnType<typeof vi.spyOn>;
  let err: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env.FLARELOG_API_KEY;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const record = (severityText: string) =>
    ({
      hrTime: [1_700_000_000, 0],
      hrTimeObserved: [1_700_000_000, 0],
      severityText,
      severityNumber: 9,
      body: "hello",
      attributes: {},
      resource: { attributes: {} },
      instrumentationScope: { name: "t" },
    }) as never;

  it("writes INFO logs to stdout by default (unchanged behaviour)", async () => {
    await new ConsoleTransport().exportLogs([record("INFO")]);

    expect(log).toHaveBeenCalledTimes(1);
    expect(err).not.toHaveBeenCalled();
  });

  it("writes every level to stderr and nothing to stdout when asked", async () => {
    const transport = new ConsoleTransport({ stderr: true });

    await transport.exportLogs([record("DEBUG"), record("INFO"), record("WARN"), record("ERROR")]);

    expect(log).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(4);
  });

  it("keeps span output off stdout too", async () => {
    const span = {
      name: "tool.call",
      kind: 0,
      spanContext: { traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: 1 },
      startTime: [1_700_000_000, 0],
      endTime: [1_700_000_001, 0],
      status: { code: 0 },
      attributes: {},
      events: [],
      links: [],
      resource: { attributes: {} },
      instrumentationScope: { name: "t" },
    } as never;

    await new ConsoleTransport({ stderr: true }).exportSpans([span]);

    expect(log).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(1);
  });

  it("is enabled for the fallback transport by flarelog({ logToStderr: true })", async () => {
    const logger = new FlareLog({ logToStderr: true, warnOnConsoleFallback: false, workerMode: true });

    logger.info("from an mcp server");
    logger.error("and an error");
    await logger.flush();

    expect(log).not.toHaveBeenCalled();
    expect(err.mock.calls.length).toBeGreaterThanOrEqual(2);
    logger.destroy();
  });

  it("applies to an explicit console transport, with a per-transport override", async () => {
    const viaConfig = new FlareLog({ logToStderr: true, transports: [{ type: "console" }], workerMode: true });
    viaConfig.info("a");
    await viaConfig.flush();
    expect(log).not.toHaveBeenCalled();
    viaConfig.destroy();

    err.mockClear();
    const overridden = new FlareLog({ logToStderr: true, transports: [{ type: "console", stderr: false }], workerMode: true });
    overridden.info("b");
    await overridden.flush();
    expect(log).toHaveBeenCalled();
    overridden.destroy();
  });
});
