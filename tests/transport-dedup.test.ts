import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { workerFetch } from "../src/frameworks/cf-workers";
import {
  getLogCalls,
  getTraceCalls,
  mockFetch,
  extractOtlpLogs,
  extractOtlpSpans,
} from "./helpers";

/**
 * Regression test for the duplicate-transport bug on Cloudflare Workers.
 *
 * When BOTH `FLARELOG_API_KEY` and `OTEL_EXPORTER_OTLP_ENDPOINT` are set (which
 * happens on CF Workers with `nodejs_compat` if the user puts both in
 * `[vars]`), the SDK used to create TWO transports that both pointed at the
 * Flarelog backend. Every log and span was therefore exported twice:
 *
 *   - OTLPTransport → https://flarelog.dev/v1/logs
 *   - FlarelogTransport → https://flarelog.dev/api/v1/logs
 *
 * The fix: if the OTLP endpoint host matches the Flarelog endpoint host AND an
 * API key is configured, skip the OTLP transport and let FlarelogTransport
 * handle everything.
 */
describe("transport dedup — OTLP endpoint pointing at Flarelog backend", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FLARELOG_API_KEY;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  });

  it("creates only FlarelogTransport when both FLARELOG_API_KEY + OTEL_EXPORTER_OTLP_ENDPOINT=https://flarelog.dev are set", async () => {
    process.env.FLARELOG_API_KEY = "fl_test_key";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://flarelog.dev";

    const { flarelog } = await import("../src/factory");
    const logger = flarelog({ workerMode: true });

    expect(logger._getTransports().map((t) => t.name)).toEqual(["flarelog"]);

    const handler = workerFetch(logger, async () => {
      for (let i = 0; i < 8; i++) {
        logger.info(`log ${i}`);
      }
      return new Response("ok", { status: 200 });
    });

    const request = new Request("https://example.com/api/test");
    const ctx = { waitUntil: vi.fn() };

    await handler(request, {}, ctx);
    // Give waitUntil-registered work a chance to settle.
    await new Promise((r) => setTimeout(r, 50));

    const logCalls = getLogCalls(fetchMock);
    const traceCalls = getTraceCalls(fetchMock);
    const totalLogRecords = logCalls.reduce(
      (sum, body) => sum + extractOtlpLogs(body).length,
      0
    );
    const totalSpans = traceCalls.reduce(
      (sum, body) => sum + extractOtlpSpans(body).length,
      0
    );

    // ✅ Regression: previously 2 calls / 16 records and 2 calls / 2 spans.
    expect(logCalls.length).toBe(1);
    expect(totalLogRecords).toBe(8);
    expect(traceCalls.length).toBe(1);
    expect(totalSpans).toBe(1);

    // Only the /api/v1/* Flarelog URLs should be called.
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain("https://flarelog.dev/api/v1/logs");
    expect(urls).toContain("https://flarelog.dev/api/v1/traces");
    expect(urls).not.toContain("https://flarelog.dev/v1/logs");
    expect(urls).not.toContain("https://flarelog.dev/v1/traces");

    logger.destroy();
  });

  it("creates only FlarelogTransport when OTLP endpoint has trailing slash but same host", async () => {
    process.env.FLARELOG_API_KEY = "fl_test_key";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://flarelog.dev/";

    const { flarelog } = await import("../src/factory");
    const logger = flarelog({ workerMode: true });

    expect(logger._getTransports().map((t) => t.name)).toEqual(["flarelog"]);

    logger.destroy();
  });

  it("still creates OTLP transport when endpoint points to a different host (e.g. Grafana)", async () => {
    process.env.FLARELOG_API_KEY = "fl_test_key";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp-gateway-prod-eu-west-0.grafana.net";

    const { flarelog } = await import("../src/factory");
    const logger = flarelog({ workerMode: true });

    // Fan-out: both transports should be present because they target different backends.
    expect(logger._getTransports().map((t) => t.name)).toEqual(["otlp", "flarelog"]);

    logger.destroy();
  });

  it("still creates OTLP transport when no API key is set (even if endpoint is flarelog.dev)", async () => {
    delete process.env.FLARELOG_API_KEY;
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://flarelog.dev";

    const { flarelog } = await import("../src/factory");
    const logger = flarelog({ workerMode: true, warnOnConsoleFallback: false });

    // No API key → FlarelogTransport isn't created, OTLP transport is.
    expect(logger._getTransports().map((t) => t.name)).toEqual(["otlp"]);

    logger.destroy();
  });

  it("still creates OTLP transport when only OTEL_EXPORTER_OTLP_LOGS_ENDPOINT is set and matches Flarelog host", async () => {
    process.env.FLARELOG_API_KEY = "fl_test_key";
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT = "https://flarelog.dev/v1/logs";

    const { flarelog } = await import("../src/factory");
    const logger = flarelog({ workerMode: true });

    // Per-signal OTLP endpoint pointing at Flarelog should also be deduped.
    expect(logger._getTransports().map((t) => t.name)).toEqual(["flarelog"]);

    logger.destroy();
  });

  it("still creates OTLP transport when only OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is set and matches Flarelog host", async () => {
    process.env.FLARELOG_API_KEY = "fl_test_key";
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = "https://flarelog.dev/v1/traces";

    const { flarelog } = await import("../src/factory");
    const logger = flarelog({ workerMode: true });

    expect(logger._getTransports().map((t) => t.name)).toEqual(["flarelog"]);

    logger.destroy();
  });

  it("respects custom FLARELOG_ENDPOINT when comparing hosts", async () => {
    process.env.FLARELOG_API_KEY = "fl_test_key";
    process.env.FLARELOG_ENDPOINT = "https://custom.flarelog.example.com";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://custom.flarelog.example.com";

    const { flarelog } = await import("../src/factory");
    const logger = flarelog({ workerMode: true });

    expect(logger._getTransports().map((t) => t.name)).toEqual(["flarelog"]);

    logger.destroy();
    delete process.env.FLARELOG_ENDPOINT;
  });

  it("explicit `transports` config bypasses dedup logic entirely", async () => {
    process.env.FLARELOG_API_KEY = "fl_test_key";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://flarelog.dev";

    // User explicitly asks for both — we trust them.
    const logger = new FlareLog({
      apiKey: "fl_test_key",
      workerMode: true,
      transports: [
        { type: "otlp", endpoint: "https://flarelog.dev" },
        { type: "flarelog" },
      ],
    });

    expect(logger._getTransports().map((t) => t.name)).toEqual(["otlp", "flarelog"]);

    logger.destroy();
  });
});
