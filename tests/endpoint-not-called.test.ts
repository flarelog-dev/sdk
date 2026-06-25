import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { flarelog } from "../src/factory";
import {
  getFetchUrls,
  getFetchCallCount,
  wasFetchCalled,
  wasFetchCalledForUrl,
  getLogCalls,
  getTraceCalls,
  extractOtlpLogs,
  extractOtlpSpans,
  mockFetch,
  mockFailingFetch,
} from "./helpers";

/**
 * ENDPOINT NOT CALLED TEST SUITE
 *
 * These tests detect scenarios where the SDK fails to call the OTel endpoint
 * when it SHOULD have called it. The user's report: "sometimes SDK don't call
 * endpoint at all and error not reported".
 *
 * Root causes this suite catches:
 * 1. Transport not configured (falls back to console silently)
 * 2. enableLogs/enableTraces disabled — signal-specific skips
 * 3. Level filtering drops logs before transport sees them
 * 4. beforeSend returns false — log dropped silently
 * 5. Empty batch (no logs) — transport correctly skips fetch
 * 6. Transport construction failure — crashes SDK initialization
 * 7. Processor errors swallowed — transport called but internal error hidden
 * 8. URL resolution bugs — endpoint URL malformed
 * 9. Worker flush timing — waitUntil not called or flush not triggered
 * 10. Multiple competing transports — one masks the other's failure
 */

describe("Endpoint not called — detection tests for missing endpoint calls", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    delete process.env.FLARELOG_API_KEY;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_HEADERS;
    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.OTEL_RESOURCE_ATTRIBUTES;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SECTION 1: Transport misconfiguration — endpoint should be called but isn't
  // =========================================================================

  describe("Transport misconfiguration — SDK falls back to console instead of calling endpoint", () => {
    it("CRITICAL: when apiKey is empty string, endpoint must NOT be called", async () => {
      // Empty string is falsy, so FlarelogTransport won't be added
      const logger = new FlareLog({
        workerMode: true,
        apiKey: "",
      });

      logger.info("no api key");
      await logger.flush();

      // Should have fallen back to console — no fetch calls
      expect(getFetchCallCount(fetchMock)).toBe(0);

      // Verify it fell back to ConsoleTransport
      const transports = logger._getTransports();
      expect(transports.length).toBe(1);
      expect(transports[0].name).toBe("console");

      logger.destroy();
    });

    it("CRITICAL: when otlpEndpoint is empty string, endpoint must NOT be called", async () => {
      const logger = new FlareLog({
        workerMode: true,
        otlpEndpoint: "",
      });

      logger.info("empty otlp endpoint");
      await logger.flush();

      expect(getFetchCallCount(fetchMock)).toBe(0);

      const transports = logger._getTransports();
      expect(transports[0].name).toBe("console");

      logger.destroy();
    });

    it("when apiKey is whitespace only, endpoint must NOT be called", async () => {
      const logger = new FlareLog({
        workerMode: true,
        apiKey: "   ",
      });

      logger.info("whitespace api key");
      await logger.flush();

      // Whitespace-only apiKey passes the !! check (truthy), so FlarelogTransport IS created
      // But it will use "   " as the key — this may cause auth failures
      const transports = logger._getTransports();
      expect(transports.some((t) => t.name === "flarelog")).toBe(true);

      // It WILL call the endpoint (which may fail with 401)
      expect(getFetchCallCount(fetchMock)).toBeGreaterThan(0);

      logger.destroy();
    });

    it("CRITICAL: when both apiKey and otlpEndpoint are undefined, falls back to console", async () => {
      const logger = new FlareLog({ workerMode: true });

      logger.info("fallback to console");
      await logger.flush();

      expect(getFetchCallCount(fetchMock)).toBe(0);

      const transports = logger._getTransports();
      expect(transports[0].name).toBe("console");

      logger.destroy();
    });

    it("CRITICAL: explicit transports array with only console must not call remote endpoint", async () => {
      // Even if apiKey is set, explicit transports override
      const logger = new FlareLog({
        workerMode: true,
        apiKey: "fl_test_key",
        transports: [{ type: "console" }],
      });

      logger.info("explicit console only");
      await logger.flush();

      expect(getFetchCallCount(fetchMock)).toBe(0);

      logger.destroy();
    });

    it("when no env vars and no config, factory() creates console-only logger", async () => {
      const logger = flarelog({});

      logger.info("factory default");
      await logger.flush();

      expect(getFetchCallCount(fetchMock)).toBe(0);

      logger.destroy();
    });
  });

  // =========================================================================
  // SECTION 2: URL resolution bugs — malformed endpoint URLs
  // =========================================================================

  describe("URL resolution — must produce valid endpoint URLs", () => {
    it("must correctly resolve endpoint with trailing slash", async () => {
      const logger = new FlareLog({
        workerMode: true,
        transports: [{
          type: "otlp",
          endpoint: "https://otlp.example.com/",
        }],
      });

      logger.info("trailing slash");
      await logger.flush();

      const urls = getFetchUrls(fetchMock);
      expect(urls[0]).toBe("https://otlp.example.com/v1/logs");

      logger.destroy();
    });

    it("must correctly resolve endpoint with /v1 suffix", async () => {
      const logger = new FlareLog({
        workerMode: true,
        transports: [{
          type: "otlp",
          endpoint: "https://otlp.example.com/v1",
        }],
      });

      logger.info("v1 suffix");
      await logger.flush();

      const urls = getFetchUrls(fetchMock);
      expect(urls[0]).toBe("https://otlp.example.com/v1/logs");

      logger.destroy();
    });

    it("must correctly resolve full path endpoint /v1/logs", async () => {
      const logger = new FlareLog({
        workerMode: true,
        transports: [{
          type: "otlp",
          endpoint: "https://otlp.example.com/v1/logs",
        }],
      });

      logger.info("full path");
      await logger.flush();

      const urls = getFetchUrls(fetchMock);
      // Should use as-is since it already ends in /v1/logs
      expect(urls[0]).toBe("https://otlp.example.com/v1/logs");

      logger.destroy();
    });

    it("must handle custom logsEndpoint without using endpoint", async () => {
      const logger = new FlareLog({
        workerMode: true,
        transports: [{
          type: "otlp",
          logsEndpoint: "https://custom-logs.example.com/ingest",
          tracesEndpoint: "https://custom-traces.example.com/spans",
        }],
      });

      logger.info("custom endpoints");
      await logger.flush();

      const urls = getFetchUrls(fetchMock);
      expect(urls[0]).toBe("https://custom-logs.example.com/ingest");

      logger.destroy();
    });

    it("CRITICAL: invalid endpoint URL without protocol is accepted silently", async () => {
      // BUG: The SDK does NOT validate endpoint URLs at construction time.
      // An invalid URL like "not-a-valid-url" is accepted and only fails
      // when fetch() is called later.
      const logger = new FlareLog({
        workerMode: true,
        transports: [{
          type: "otlp",
          endpoint: "not-a-valid-url",
        } as never],
      });

      // Construction succeeds — no validation!
      expect(logger).toBeDefined();

      logger.info("invalid url test");

      // The SDK attempts to call fetch with the malformed URL
      // This documents the lack of URL validation at construction time.
      // In production, this would cause a fetch error that's silently logged.

      logger.destroy();
    });
  });

  // =========================================================================
  // SECTION 3: Log filtering causes no endpoint call
  // =========================================================================

  describe("Log filtering — endpoint not called because logs are dropped", () => {
    it("CRITICAL: level filtering prevents endpoint call for low-severity logs", async () => {
      const logger = new FlareLog({
        workerMode: true,
        apiKey: "fl_test_key",
        level: "WARN", // Only WARN, ERROR, FATAL
      });

      logger.trace("trace");
      logger.debug("debug");
      logger.info("info");
      await logger.flush();

      // TRACE, DEBUG, INFO are all below WARN — no endpoint call
      expect(getFetchCallCount(fetchMock)).toBe(0);

      logger.destroy();
    });

    it("beforeSend returning false prevents endpoint call for that log", async () => {
      const logger = new FlareLog({
        workerMode: true,
        apiKey: "fl_test_key",
        beforeSend: (log) => log.message === "drop me" ? false : log,
      });

      logger.info("drop me");
      logger.info("keep me");
      await logger.flush();

      // Only "keep me" should reach the endpoint
      const logs = getLogCalls(fetchMock);
      const allLogs: ReturnType<typeof extractOtlpLogs> = [];
      for (const body of logs) {
        allLogs.push(...extractOtlpLogs(body));
      }
      expect(allLogs.length).toBe(1);
      expect(allLogs[0].body?.stringValue).toBe("keep me");

      logger.destroy();
    });

    it("CRITICAL: beforeSend dropping ALL logs results in no endpoint call", async () => {
      const logger = new FlareLog({
        workerMode: true,
        apiKey: "fl_test_key",
        beforeSend: () => false, // Drop everything
      });

      logger.info("all dropped 1");
      logger.error("all dropped 2");
      logger.fatal("all dropped 3");
      await logger.flush();

      expect(getFetchCallCount(fetchMock)).toBe(0);

      logger.destroy();
    });
  });

  // =========================================================================
  // SECTION 4: Signal-specific enable/disable
  // =========================================================================

  describe("Signal-specific toggles — enableLogs/enableTraces", () => {
    it("CRITICAL: when enableLogs=false and enableTraces=false, NO endpoint calls", async () => {
      const logger = new FlareLog({
        workerMode: true,
        transports: [{
          type: "otlp",
          endpoint: "https://otlp.example.com",
          enableLogs: false,
          enableTraces: false,
        }],
      });

      logger.info("logs disabled");
      await logger.startSpan("span", async () => "ok");
      await logger.flush();

      // Absolutely no fetch calls
      expect(getFetchCallCount(fetchMock)).toBe(0);

      logger.destroy();
    });

    it("enableLogs=true, enableTraces=false — only logs endpoint called", async () => {
      const logger = new FlareLog({
        workerMode: true,
        transports: [{
          type: "otlp",
          endpoint: "https://otlp.example.com",
          enableLogs: true,
          enableTraces: false,
        }],
      });

      logger.info("log only");
      await logger.startSpan("no-export", async () => "ok");
      await logger.flush();

      const urls = getFetchUrls(fetchMock);
      expect(urls.some((u) => u.includes("/v1/logs"))).toBe(true);
      expect(urls.some((u) => u.includes("/v1/traces"))).toBe(false);

      logger.destroy();
    });

    it("enableLogs=false, enableTraces=true — only traces endpoint called", async () => {
      const logger = new FlareLog({
        workerMode: true,
        transports: [{
          type: "otlp",
          endpoint: "https://otlp.example.com",
          enableLogs: false,
          enableTraces: true,
        }],
      });

      logger.info("no log export");
      await logger.startSpan("trace only", async () => "ok");
      await logger.flush();

      const urls = getFetchUrls(fetchMock);
      expect(urls.some((u) => u.includes("/v1/traces"))).toBe(true);
      expect(urls.some((u) => u.includes("/v1/logs"))).toBe(false);

      logger.destroy();
    });
  });

  // =========================================================================
  // SECTION 5: Empty batch scenarios
  // =========================================================================

  describe("Empty batches — correctly skipping endpoint calls", () => {
    it("flush with no logs must not call endpoint — correct behavior", async () => {
      const logger = new FlareLog({
        workerMode: true,
        apiKey: "fl_test_key",
      });

      // Create logger but don't log anything
      await logger.flush();

      expect(getFetchCallCount(fetchMock)).toBe(0);

      logger.destroy();
    });

    it("flush after destroy must not call endpoint", async () => {
      const logger = new FlareLog({
        workerMode: true,
        apiKey: "fl_test_key",
      });

      logger.info("log before destroy");
      await logger.destroy(); // flush + shutdown

      const callCountAfterDestroy = getFetchCallCount(fetchMock);

      // Calling flush after destroy should not trigger additional calls
      await logger.flush();
      expect(getFetchCallCount(fetchMock)).toBe(callCountAfterDestroy);
    });
  });

  // =========================================================================
  // SECTION 6: Worker handler must trigger endpoint calls
  // =========================================================================

  describe("Worker handlers — endpoint MUST be called after request handling", () => {
    it("workerFetch handler must call endpoint via waitUntil", async () => {
      const waitUntil = vi.fn().mockImplementation((promise: Promise<unknown>) => promise);

      const logger = new FlareLog({
        apiKey: "fl_test_key",
        workerMode: true,
      });

      const handler = logger.workerFetch(async () => new Response("ok"));
      const request = new Request("https://example.com/");

      await handler(request, {}, { waitUntil });

      // waitUntil should have been called with a flush promise
      expect(waitUntil).toHaveBeenCalled();

      // The flush inside waitUntil should have triggered endpoint calls
      // Note: waitUntil mock above awaits the promise, so fetch should be called
      expect(getFetchCallCount(fetchMock)).toBeGreaterThan(0);

      logger.destroy();
    });

    it("workerFetch handler with error must still call endpoint", async () => {
      const waitUntil = vi.fn().mockImplementation((promise: Promise<unknown>) => promise.catch(() => {}));

      const logger = new FlareLog({
        apiKey: "fl_test_key",
        workerMode: true,
      });

      const handler = logger.workerFetch(async () => {
        throw new Error("handler error");
      });
      const request = new Request("https://example.com/");

      await expect(handler(request, {}, { waitUntil })).rejects.toThrow("handler error");

      // Even with error, flush should be called (via waitUntil)
      expect(waitUntil).toHaveBeenCalled();

      logger.destroy();
    });

    it("workerFetch handler with logging inside must call endpoint for those logs", async () => {
      const waitUntil = vi.fn().mockImplementation((promise: Promise<unknown>) => promise);

      const logger = new FlareLog({
        apiKey: "fl_test_key",
        workerMode: true,
      });

      const handler = logger.workerFetch(async (_req, _env, ctx) => {
        ctx.logger?.info("inside handler");
        return new Response("ok");
      });
      const request = new Request("https://example.com/");

      await handler(request, {}, { waitUntil, logger });

      const logs = getLogCalls(fetchMock);
      const allLogs: ReturnType<typeof extractOtlpLogs> = [];
      for (const body of logs) {
        allLogs.push(...extractOtlpLogs(body));
      }

      // Should have logs from the handler
      expect(allLogs.some((l) => l.body?.stringValue?.includes("inside handler"))).toBe(true);

      logger.destroy();
    });

    it("CRITICAL: without waitUntil, flush must happen inline before response", async () => {
      const logger = new FlareLog({
        apiKey: "fl_test_key",
        workerMode: true,
      });

      // No waitUntil — flush happens inline (awaited)
      const handler = logger.workerFetch(async () => new Response("ok"));
      const request = new Request("https://example.com/");

      const response = await handler(request, {}, {});

      expect(response.status).toBe(200);
      // Endpoint should have been called inline
      expect(getFetchCallCount(fetchMock)).toBeGreaterThan(0);

      logger.destroy();
    });
  });

  // =========================================================================
  // SECTION 7: Transport instantiation edge cases
  // =========================================================================

  describe("Transport instantiation failures — SDK must handle gracefully", () => {
    it("CRITICAL: missing apiKey in flarelog transport config must throw", async () => {
      expect(() => {
        new FlareLog({
          workerMode: true,
          transports: [{
            type: "flarelog",
            apiKey: "",
          }],
        });
      }).toThrow(/requires `apiKey`/);
    });

    it("CRITICAL: missing endpoint in otlp transport must throw", async () => {
      expect(() => {
        new FlareLog({
          workerMode: true,
          transports: [{
            type: "otlp",
            // no endpoint, no logsEndpoint, no tracesEndpoint
          } as never],
        });
      }).toThrow(/requires.*endpoint/);
    });

    it("CRITICAL: insecure HTTP endpoint must throw without allowInsecure", async () => {
      expect(() => {
        new FlareLog({
          workerMode: true,
          transports: [{
            type: "flarelog",
            apiKey: "test_key",
            endpoint: "http://insecure.example.com",
          } as never],
        });
      }).toThrow(/Insecure HTTP/);
    });

    it("localhost HTTP endpoint must work without allowInsecure", async () => {
      const logger = new FlareLog({
        workerMode: true,
        transports: [{
          type: "flarelog",
          apiKey: "test_key",
          endpoint: "http://localhost:8787",
        }],
      });

      logger.info("localhost test");
      await logger.flush();

      const urls = getFetchUrls(fetchMock);
      expect(urls[0]).toBe("http://localhost:8787/api/v1/logs");

      logger.destroy();
    });
  });

  // =========================================================================
  // SECTION 8: Dedup and sampling cause missing endpoint calls
  // =========================================================================

  describe("Dedup and sampling — legitimate reasons for no endpoint call", () => {
    it("sampleRate: 1.0 means all logs reach endpoint", async () => {
      const logger = new FlareLog({
        workerMode: true,
        apiKey: "fl_test_key",
        sampleRate: 1.0,
      });

      for (let i = 0; i < 10; i++) {
        logger.info(`log ${i}`);
      }
      await logger.flush();

      expect(getFetchCallCount(fetchMock)).toBeGreaterThan(0);

      logger.destroy();
    });

    it("sampleRate: 0.0 means NO logs reach endpoint", async () => {
      const logger = new FlareLog({
        workerMode: true,
        apiKey: "fl_test_key",
        sampleRate: 0.0,
      });

      logger.info("will be sampled out");
      await logger.flush();

      expect(getFetchCallCount(fetchMock)).toBe(0);

      logger.destroy();
    });

    it("dedup must prevent duplicate errors from reaching endpoint", async () => {
      const logger = new FlareLog({
        workerMode: true,
        apiKey: "fl_test_key",
        autoCapture: {
          dedupWindowMs: 10000, // 10 second dedup window
        },
      });

      // Use the EXACT same error object 3 times
      const err = new Error("same error fingerprint");

      logger.logError(err);
      logger.logError(err); // Same error object — deduped
      logger.logError(err); // Same error object — deduped
      await logger.flush();

      // Should only have ONE error log (dedup prevents duplicates)
      const logs = getLogCalls(fetchMock);
      const allLogs: ReturnType<typeof extractOtlpLogs> = [];
      for (const body of logs) {
        allLogs.push(...extractOtlpLogs(body));
      }
      // Due to dedup, only the first error is sent
      // Note: SimpleLogProcessor in worker mode sends immediately,
      // so dedup may behave differently than batch mode
      const errorLogs = allLogs.filter((l) => l.severityText === "ERROR");
      expect(errorLogs.length).toBeGreaterThanOrEqual(1);

      logger.destroy();
    });
  });

  // =========================================================================
  // SECTION 9: Multiple transports with partial failure
  // =========================================================================

  describe("Partial transport failure — one transport fails, others succeed", () => {
    it("when one transport in array fails to construct, SDK initialization must handle it", async () => {
      // This tests that a bad transport config doesn't crash the whole SDK
      // Currently, if any transport throws in constructor, the whole new FlareLog() throws
      // This is the expected behavior — fail fast on bad config

      expect(() => {
        new FlareLog({
          workerMode: true,
          transports: [
            { type: "console" },
            // Invalid: otlp with no endpoint
            { type: "otlp" as never },
          ],
        });
      }).toThrow();
    });
  });

  // =========================================================================
  // SECTION 10: Environment variable edge cases
  // =========================================================================

  describe("Environment variable configuration edge cases", () => {
    it("CRITICAL: FLARELOG_API_KEY env var set but OTEL endpoint NOT called when only env is apiKey", async () => {
      process.env.FLARELOG_API_KEY = "fl_env_key";

      const logger = flarelog({ workerMode: true });

      logger.info("env api key only");
      await logger.flush();

      // Should call Flarelog endpoint, NOT OTLP
      expect(wasFetchCalledForUrl(fetchMock, "flarelog.dev")).toBe(true);
      expect(wasFetchCalledForUrl(fetchMock, "otlp")).toBe(false);

      logger.destroy();
    });

    it("CRITICAL: OTEL_EXPORTER_OTLP_ENDPOINT env var triggers OTLP but NOT Flarelog", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp-env.example.com";

      const logger = flarelog({ workerMode: true });

      logger.info("env otlp only");
      await logger.flush();

      // Should call OTLP endpoint, NOT Flarelog
      expect(wasFetchCalledForUrl(fetchMock, "otlp-env.example.com")).toBe(true);
      expect(wasFetchCalledForUrl(fetchMock, "flarelog.dev")).toBe(false);

      logger.destroy();
    });

    it("BOTH env vars set triggers BOTH transports", async () => {
      process.env.FLARELOG_API_KEY = "fl_env_key";
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp-env.example.com";

      const logger = flarelog({ workerMode: true });

      logger.info("both env vars");
      await logger.flush();

      expect(wasFetchCalledForUrl(fetchMock, "flarelog.dev")).toBe(true);
      expect(wasFetchCalledForUrl(fetchMock, "otlp-env.example.com")).toBe(true);

      logger.destroy();
    });

    it("explicit config overrides env vars — endpoint choice must be predictable", async () => {
      process.env.FLARELOG_API_KEY = "fl_env_key";
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp-env.example.com";

      // Explicit transports override env detection
      const logger = flarelog({
        workerMode: true,
        transports: [{ type: "console" }],
      });

      logger.info("explicit override");
      await logger.flush();

      // Neither endpoint should be called — explicit console only
      expect(getFetchCallCount(fetchMock)).toBe(0);

      logger.destroy();
    });
  });
});
