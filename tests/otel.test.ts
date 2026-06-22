import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { flarelog } from "../src/factory";
import { ConsoleTransport } from "../src/otel/console-transport";
import { OTLPTransport } from "../src/otel/otlp-transport";
import { FlarelogTransport } from "../src/otel/flarelog-transport";
import {
  extractOtlpLogs,
  extractOtlpSpans,
  attrsToObject,
  getLogCalls,
  getTraceCalls,
  mockFetch,
} from "./helpers";

describe("OTel transport system", () => {
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

  describe("ConsoleTransport (default — no API key)", () => {
    it("pretty-prints logs to console without any fetch calls", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new FlareLog({ workerMode: true });

      logger.info("hello console");
      await logger.flush();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalled();
      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("hello console");
      expect(output).toContain("INFO");
      logger.destroy();
    });

    it("pretty-prints spans to console", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new FlareLog({ workerMode: true });

      await logger.startSpan("test-span", async (span) => {
        span.setAttribute("test.attr", "value");
        return "done";
      });
      await logger.flush();

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("test-span");
      logger.destroy();
    });
  });

  describe("OTLPTransport (any OTel backend)", () => {
    it("ships logs to /v1/logs as OTLP JSON", async () => {
      const logger = new FlareLog({
        workerMode: true,
        otlpEndpoint: "https://otlp.example.com",
        otlpHeaders: { Authorization: "Basic abc" },
      });

      logger.info("hello otlp");
      await logger.flush();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://otlp.example.com/v1/logs",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Basic abc",
          }),
        })
      );

      const logCalls = getLogCalls(fetchMock);
      expect(logCalls.length).toBe(1);
      const logs = extractOtlpLogs(logCalls[0]);
      expect(logs.length).toBe(1);
      expect(logs[0].body?.stringValue).toBe("hello otlp");
      expect(logs[0].severityText).toBe("INFO");
      logger.destroy();
    });

    it("ships spans to /v1/traces as OTLP JSON", async () => {
      const logger = new FlareLog({
        workerMode: true,
        otlpEndpoint: "https://otlp.example.com",
      });

      await logger.startSpan("db-query", async (span) => {
        span.setAttribute("db.system", "postgresql");
        span.setAttribute("db.statement", "SELECT * FROM users");
        return "result";
      });
      await logger.flush();

      const traceCalls = getTraceCalls(fetchMock);
      expect(traceCalls.length).toBe(1);
      const spans = extractOtlpSpans(traceCalls[0]);
      expect(spans.length).toBe(1);
      expect(spans[0].name).toBe("db-query");
      const attrs = attrsToObject(spans[0].attributes);
      expect(attrs["db.system"]).toBe("postgresql");
      logger.destroy();
    });

    it("includes resource attributes (service.name, telemetry.sdk.name)", async () => {
      const logger = new FlareLog({
        workerMode: true,
        otlpEndpoint: "https://otlp.example.com",
        serviceName: "my-worker",
        environment: "production",
      });

      logger.info("check resource");
      await logger.flush();

      const logCalls = getLogCalls(fetchMock);
      const body = logCalls[0] as { resourceLogs: Array<{ resource: { attributes: Array<{ key: string; value: { stringValue?: string } }> } }> };
      const resourceAttrs = attrsToObject(body.resourceLogs[0].resource.attributes);
      expect(resourceAttrs["service.name"]).toBe("my-worker");
      expect(resourceAttrs["telemetry.sdk.name"]).toBe("flarelog");
      expect(resourceAttrs["deployment.environment.name"]).toBe("production");
      logger.destroy();
    });

    it("respects OTEL_EXPORTER_OTLP_ENDPOINT env var", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp-env.example.com";
      const logger = new FlareLog({ workerMode: true });

      logger.info("env-configured");
      await logger.flush();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://otlp-env.example.com/v1/logs",
        expect.anything()
      );
      logger.destroy();
    });

    it("respects OTEL_EXPORTER_OTLP_HEADERS env var", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp.example.com";
      process.env.OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Basic secret,x-custom=foo";
      const logger = new FlareLog({ workerMode: true });

      logger.info("env-headers");
      await logger.flush();

      const call = fetchMock.mock.calls[0];
      const headers = (call[1] as { headers: Record<string, string> }).headers;
      expect(headers["Authorization"]).toBe("Basic secret");
      expect(headers["x-custom"]).toBe("foo");
      logger.destroy();
    });

    it("handles full URL endpoint that already ends in /v1/logs", async () => {
      const logger = new FlareLog({
        workerMode: true,
        transports: [{
          type: "otlp",
          logsEndpoint: "https://custom.example.com/ingest/logs",
        }],
      });

      logger.info("custom path");
      await logger.flush();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://custom.example.com/ingest/logs",
        expect.anything()
      );
      logger.destroy();
    });
  });

  describe("FlarelogTransport (gated backend)", () => {
    it("ships logs to /api/v1/logs with Bearer auth", async () => {
      const logger = new FlareLog({
        apiKey: "fl_test_key",
        workerMode: true,
      });

      logger.info("hello flarelog");
      await logger.flush();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://flarelog.dev/api/v1/logs",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer fl_test_key",
          }),
        })
      );
      logger.destroy();
    });

    it("ships spans to /api/v1/traces", async () => {
      const logger = new FlareLog({
        apiKey: "fl_test_key",
        workerMode: true,
      });

      await logger.startSpan("test", async () => "ok");
      await logger.flush();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://flarelog.dev/api/v1/traces",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer fl_test_key",
          }),
        })
      );
      logger.destroy();
    });

    it("rejects insecure HTTP endpoints by default", () => {
      expect(() => {
        new FlareLog({
          apiKey: "test",
          endpoint: "http://evil.example.com",
        });
      }).toThrow(/Insecure HTTP/);
    });

    it("allows insecure HTTP with allowInsecure: true", () => {
      expect(() => {
        const l = new FlareLog({
          apiKey: "test",
          endpoint: "http://localhost:8787",
          allowInsecure: true,
        });
        l.destroy();
      }).not.toThrow();
    });
  });

  describe("Multi-transport fan-out", () => {
    it("fans out logs to console + OTLP + Flarelog simultaneously", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new FlareLog({
        apiKey: "fl_test_key",
        workerMode: true,
        otlpEndpoint: "https://otlp.example.com",
        // When apiKey + otlpEndpoint are set (without explicit transports),
        // the SDK auto-configures OTLP + Flarelog transports. We also add
        // console via the transports array — but explicit transports override
        // env detection. So to get all three, we either rely on env vars alone,
        // OR list all three explicitly.
        // Here we test the env-var path: set both env vars and don't pass `transports`.
      });
      // Override the auto-detected transports to ALSO include console
      // (normally env-based detection gives us OTLP + Flarelog only)
      // We'll verify the auto-detection gives us both:
      const transports = logger._getTransports();
      expect(transports.some((t) => t instanceof OTLPTransport)).toBe(true);
      expect(transports.some((t) => t instanceof FlarelogTransport)).toBe(true);

      logger.info("fan out test");
      await logger.flush();

      // OTLP transport should have shipped to /v1/logs
      expect(fetchMock).toHaveBeenCalledWith(
        "https://otlp.example.com/v1/logs",
        expect.anything()
      );

      // Flarelog transport should have shipped to /api/v1/logs
      expect(fetchMock).toHaveBeenCalledWith(
        "https://flarelog.dev/api/v1/logs",
        expect.anything()
      );

      logger.destroy();
    });

    it("fans out to console + OTLP + Flarelog via explicit transports array", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new FlareLog({
        workerMode: true,
        transports: [
          { type: "console" },
          { type: "otlp", endpoint: "https://otlp.example.com" },
          { type: "flarelog", apiKey: "fl_explicit_key" },
        ],
      });

      logger.info("explicit fan out");
      await logger.flush();

      // Console transport should have printed
      expect(logSpy).toHaveBeenCalled();

      // OTLP transport should have shipped to /v1/logs
      expect(fetchMock).toHaveBeenCalledWith(
        "https://otlp.example.com/v1/logs",
        expect.anything()
      );

      // Flarelog transport should have shipped to /api/v1/logs
      expect(fetchMock).toHaveBeenCalledWith(
        "https://flarelog.dev/api/v1/logs",
        expect.anything()
      );

      logger.destroy();
    });

    it("explicit transports override env-based detection", async () => {
      process.env.FLARELOG_API_KEY = "fl_env_key";
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp-env.example.com";

      const logger = new FlareLog({
        workerMode: true,
        transports: [{ type: "console" }],  // explicit — should ignore env
      });

      logger.info("explicit only");
      await logger.flush();

      // Should NOT have called fetch — only console transport is configured
      expect(fetchMock).not.toHaveBeenCalled();
      logger.destroy();
    });
  });

  describe("W3C trace context propagation", () => {
    it("extracts traceparent from incoming request headers", async () => {
      const logger = new FlareLog({
        apiKey: "test",
        workerMode: true,
      });

      const traceId = "0af7651916cd43dd8448eb211c80319c";
      const spanId = "b7ad6b7169203331";
      const handler = logger.workerFetch(async () => new Response("ok"));
      const request = new Request("https://example.com/", {
        headers: { traceparent: `00-${traceId}-${spanId}-01` },
      });

      await handler(request, {}, { waitUntil: vi.fn() });
      await logger.flush();

      const traceCalls = getTraceCalls(fetchMock);
      const spans = extractOtlpSpans(traceCalls[0]);
      expect(spans[0].traceId).toBe(traceId);
      logger.destroy();
    });

    it("generates a new traceId when no traceparent header is present", async () => {
      const logger = new FlareLog({
        apiKey: "test",
        workerMode: true,
      });

      const handler = logger.workerFetch(async () => new Response("ok"));
      const request = new Request("https://example.com/");

      await handler(request, {}, { waitUntil: vi.fn() });
      await logger.flush();

      const traceCalls = getTraceCalls(fetchMock);
      const spans = extractOtlpSpans(traceCalls[0]);
      expect(spans[0].traceId).toBeDefined();
      expect(spans[0].traceId).toHaveLength(32);  // 16 bytes hex
      logger.destroy();
    });

    it("injects trace context into outgoing headers via injectTraceContext()", async () => {
      const logger = new FlareLog({
        apiKey: "test",
        workerMode: true,
      });

      const outgoingHeaders = new Headers();
      let capturedHeaders: Headers | undefined;

      await logger.startSpan("client-call", async () => {
        logger.injectTraceContext(outgoingHeaders);
        capturedHeaders = outgoingHeaders;
        return "ok";
      });

      expect(capturedHeaders).toBeDefined();
      const traceparent = capturedHeaders!.get("traceparent");
      expect(traceparent).toBeDefined();
      expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
      logger.destroy();
    });
  });

  describe("Log-to-trace correlation", () => {
    it("logs emitted inside a span carry the span's traceId and spanId", async () => {
      const logger = new FlareLog({
        apiKey: "test",
        workerMode: true,
      });

      await logger.startSpan("outer-op", async () => {
        logger.info("inside the span");
        return "ok";
      });
      await logger.flush();

      const logCalls = getLogCalls(fetchMock);
      const traceCalls = getTraceCalls(fetchMock);

      const logs = extractOtlpLogs(logCalls[0]);
      const spans = extractOtlpSpans(traceCalls[0]);

      const innerLog = logs.find((l) => l.body?.stringValue === "inside the span");
      expect(innerLog).toBeDefined();
      expect(innerLog?.traceId).toBe(spans[0].traceId);
      expect(innerLog?.spanId).toBe(spans[0].spanId);
      logger.destroy();
    });
  });

  describe("factory() auto-detection", () => {
    it("returns ConsoleTransport when nothing is configured", () => {
      const logger = flarelog({});
      const transports = logger._getTransports();
      expect(transports).toHaveLength(1);
      expect(transports[0]).toBeInstanceOf(ConsoleTransport);
      logger.destroy();
    });

    it("returns FlarelogTransport when FLARELOG_API_KEY is set", () => {
      process.env.FLARELOG_API_KEY = "fl_auto_key";
      const logger = flarelog({});
      const transports = logger._getTransports();
      expect(transports.some((t) => t instanceof FlarelogTransport)).toBe(true);
      logger.destroy();
    });

    it("returns OTLPTransport when OTEL_EXPORTER_OTLP_ENDPOINT is set", () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp.example.com";
      const logger = flarelog({});
      const transports = logger._getTransports();
      expect(transports.some((t) => t instanceof OTLPTransport)).toBe(true);
      logger.destroy();
    });

    it("returns both when both env vars are set (fan-out)", () => {
      process.env.FLARELOG_API_KEY = "fl_key";
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp.example.com";
      const logger = flarelog({});
      const transports = logger._getTransports();
      expect(transports.some((t) => t instanceof OTLPTransport)).toBe(true);
      expect(transports.some((t) => t instanceof FlarelogTransport)).toBe(true);
      logger.destroy();
    });

    it("respects OTEL_SERVICE_NAME for resource attributes", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp.example.com";
      process.env.OTEL_SERVICE_NAME = "my-app";
      const logger = flarelog({ workerMode: true });

      logger.info("check service name");
      await logger.flush();

      const logCalls = getLogCalls(fetchMock);
      const body = logCalls[0] as { resourceLogs: Array<{ resource: { attributes: Array<{ key: string; value: { stringValue?: string } }> } }> };
      const attrs = attrsToObject(body.resourceLogs[0].resource.attributes);
      expect(attrs["service.name"]).toBe("my-app");
      logger.destroy();
    });
  });
});
