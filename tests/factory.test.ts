import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flarelog } from "../src/factory";
import { FlareLog } from "../src/client";
import { ConsoleTransport } from "../src/otel/console-transport";
import { OTLPTransport } from "../src/otel/otlp-transport";
import { FlarelogTransport } from "../src/otel/flarelog-transport";
import { getLogCalls, mockFetch } from "./helpers";

describe("flarelog factory (v2 — OTel-native)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    // Clear env vars that might leak between tests
    delete process.env.FLARELOG_API_KEY;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_HEADERS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a logger with no API key — defaults to console transport", () => {
    const logger = flarelog({});
    expect(logger).toBeInstanceOf(FlareLog);
    const transports = logger._getTransports();
    expect(transports).toHaveLength(1);
    expect(transports[0]).toBeInstanceOf(ConsoleTransport);
  });

  it("creates a logger with FLARELOG_API_KEY — adds Flarelog transport", () => {
    process.env.FLARELOG_API_KEY = "fl_test_key";
    const logger = flarelog({});
    const transports = logger._getTransports();
    expect(transports.some((t) => t instanceof FlarelogTransport)).toBe(true);
    logger.destroy();
  });

  it("creates a logger with OTEL_EXPORTER_OTLP_ENDPOINT — adds OTLP transport", () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp.example.com";
    const logger = flarelog({});
    const transports = logger._getTransports();
    expect(transports.some((t) => t instanceof OTLPTransport)).toBe(true);
    logger.destroy();
  });

  it("fans out to multiple transports when both API key and OTLP endpoint are set", () => {
    process.env.FLARELOG_API_KEY = "fl_test_key";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp.example.com";
    const logger = flarelog({});
    const transports = logger._getTransports();
    expect(transports.some((t) => t instanceof OTLPTransport)).toBe(true);
    expect(transports.some((t) => t instanceof FlarelogTransport)).toBe(true);
    logger.destroy();
  });

  it("allows explicit transports override", () => {
    const logger = flarelog({
      apiKey: "ignored-because-transports-explicit",
      transports: [{ type: "console" }],
    });
    const transports = logger._getTransports();
    expect(transports).toHaveLength(1);
    expect(transports[0]).toBeInstanceOf(ConsoleTransport);
    logger.destroy();
  });

  it("allows otlpEndpoint shorthand", () => {
    const logger = flarelog({
      otlpEndpoint: "https://otlp.example.com",
    });
    const transports = logger._getTransports();
    expect(transports.some((t) => t instanceof OTLPTransport)).toBe(true);
    logger.destroy();
  });

  it("enables auto-capture by default", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = flarelog({ apiKey: "test", workerMode: true });
    console.error("test error");

    await logger.flush();
    const logCalls = getLogCalls(fetchMock);
    expect(logCalls.length).toBeGreaterThan(0);
    logger.destroy();
  });

  it("allows overriding auto-capture defaults", () => {
    const logger = flarelog({
      apiKey: "test",
      autoCapture: { console: false },
    });
    expect(logger).toBeDefined();
    logger.destroy();
  });
});
