import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { flarelog } from "../src/factory";
import { workerFetch, pagesFunction } from "../src/frameworks/cf-workers";
import {
  getLogCalls,
  getTraceCalls,
  mockFetch,
  extractOtlpLogs,
  extractOtlpSpans,
} from "./helpers";

/**
 * Regression tests for the OPTIONS/HEAD + ignorePaths bypass.
 *
 * Background: when a browser loads a page backed by a Cloudflare Worker, the
 * browser typically fires TWO requests per page load — one for the URL and
 * one for `/favicon.ico`. Each request creates 8 logs + 1 span and flushes
 * its own batch. Without a way to skip these noise requests, users see
 * duplicate calls to `/v1/logs` and `/v1/traces` and conclude the SDK is
 * double-batching.
 *
 * The fix mirrors what `@sentry/cloudflare` does for OPTIONS/HEAD and adds
 * a user-configurable `ignorePaths` list for arbitrary path patterns
 * (favicon, robots.txt, static assets, etc.).
 */
describe("request bypass — OPTIONS/HEAD + ignorePaths", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // OPTIONS / HEAD — automatic bypass
  // -------------------------------------------------------------------------

  describe("OPTIONS and HEAD requests", () => {
    it("OPTIONS request bypasses span creation and flush (no /v1/logs, no /v1/traces)", async () => {
      const logger = new FlareLog({ apiKey: "fl_test", workerMode: true });
      const handler = workerFetch(logger, async () => {
        logger.info("should not be flushed");
        return new Response(null, { status: 204 });
      });

      const request = new Request("https://example.com/api", { method: "OPTIONS" });
      const ctx = { waitUntil: vi.fn() };

      const response = await handler(request, {}, ctx);
      expect(response.status).toBe(204);

      // Wait for any potential background work to settle.
      await new Promise((r) => setTimeout(r, 50));

      expect(getLogCalls(fetchMock).length).toBe(0);
      expect(getTraceCalls(fetchMock).length).toBe(0);
      // ctx.waitUntil should NOT have been called either — no flush to register.
      expect(ctx.waitUntil).not.toHaveBeenCalled();

      logger.destroy();
    });

    it("HEAD request bypasses span creation and flush", async () => {
      const logger = new FlareLog({ apiKey: "fl_test", workerMode: true });
      const handler = workerFetch(logger, async () => {
        logger.info("should not be flushed");
        return new Response(null, { status: 200 });
      });

      const request = new Request("https://example.com/api", { method: "HEAD" });
      const ctx = { waitUntil: vi.fn() };

      const response = await handler(request, {}, ctx);
      expect(response.status).toBe(200);

      await new Promise((r) => setTimeout(r, 50));

      expect(getLogCalls(fetchMock).length).toBe(0);
      expect(getTraceCalls(fetchMock).length).toBe(0);

      logger.destroy();
    });

    it("handler still runs and returns its response on OPTIONS/HEAD", async () => {
      const logger = new FlareLog({ apiKey: "fl_test", workerMode: true });
      const handler = workerFetch(logger, async () => {
        return new Response("real body", { status: 201, headers: { "X-Custom": "yes" } });
      });

      const request = new Request("https://example.com/api", { method: "OPTIONS" });
      const response = await handler(request, {}, { waitUntil: vi.fn() });

      expect(response.status).toBe(201);
      expect(await response.text()).toBe("real body");
      expect(response.headers.get("X-Custom")).toBe("yes");

      logger.destroy();
    });

    it("GET request still gets full instrumentation (bypass does not over-fire)", async () => {
      const logger = new FlareLog({ apiKey: "fl_test", workerMode: true });
      const handler = workerFetch(logger, async () => {
        logger.info("hello");
        return new Response("ok");
      });

      const request = new Request("https://example.com/api", { method: "GET" });
      const ctx = { waitUntil: vi.fn() };
      await handler(request, {}, ctx);

      await new Promise((r) => setTimeout(r, 50));

      const logCalls = getLogCalls(fetchMock);
      const traceCalls = getTraceCalls(fetchMock);
      expect(logCalls.length).toBe(1);
      expect(extractOtlpLogs(logCalls[0]).length).toBe(1);
      expect(traceCalls.length).toBe(1);
      expect(extractOtlpSpans(traceCalls[0]).length).toBe(1);

      logger.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // ignorePaths — user-configured path patterns
  // -------------------------------------------------------------------------

  describe("ignorePaths config", () => {
    it("string match: /favicon.ico is bypassed", async () => {
      const logger = new FlareLog({
        apiKey: "fl_test",
        workerMode: true,
        ignorePaths: ["/favicon.ico"],
      });
      const handler = workerFetch(logger, async () => {
        logger.info("favicon request");
        return new Response(null, { status: 204 });
      });

      const request = new Request("https://example.com/favicon.ico");
      const ctx = { waitUntil: vi.fn() };

      await handler(request, {}, ctx);
      await new Promise((r) => setTimeout(r, 50));

      expect(getLogCalls(fetchMock).length).toBe(0);
      expect(getTraceCalls(fetchMock).length).toBe(0);
      expect(ctx.waitUntil).not.toHaveBeenCalled();

      logger.destroy();
    });

    it("RegExp match: /^\\/static\\// bypasses any path under /static/", async () => {
      const logger = new FlareLog({
        apiKey: "fl_test",
        workerMode: true,
        ignorePaths: [/^\/static\//],
      });
      const handler = workerFetch(logger, async () => {
        logger.info("static asset");
        return new Response("asset");
      });

      const ctx = { waitUntil: vi.fn() };
      await handler(new Request("https://example.com/static/css/app.css"), {}, ctx);
      await handler(new Request("https://example.com/static/js/bundle.js"), {}, ctx);
      await new Promise((r) => setTimeout(r, 50));

      expect(getLogCalls(fetchMock).length).toBe(0);
      expect(getTraceCalls(fetchMock).length).toBe(0);

      logger.destroy();
    });

    it("function match: custom predicate is honored", async () => {
      const logger = new FlareLog({
        apiKey: "fl_test",
        workerMode: true,
        ignorePaths: [(p) => p.startsWith("/health") || p === "/ping"],
      });
      const handler = workerFetch(logger, async () => {
        logger.info("healthcheck");
        return new Response("ok");
      });

      const ctx = { waitUntil: vi.fn() };
      await handler(new Request("https://example.com/health"), {}, ctx);
      await handler(new Request("https://example.com/healthz"), {}, ctx);
      await handler(new Request("https://example.com/ping"), {}, ctx);
      await new Promise((r) => setTimeout(r, 50));

      expect(getLogCalls(fetchMock).length).toBe(0);
      expect(getTraceCalls(fetchMock).length).toBe(0);

      logger.destroy();
    });

    it("non-matching paths still get full instrumentation", async () => {
      const logger = new FlareLog({
        apiKey: "fl_test",
        workerMode: true,
        ignorePaths: ["/favicon.ico", "/robots.txt"],
      });
      const handler = workerFetch(logger, async () => {
        logger.info("real request");
        return new Response("ok");
      });

      const ctx = { waitUntil: vi.fn() };
      await handler(new Request("https://example.com/api/users"), {}, ctx);
      await new Promise((r) => setTimeout(r, 50));

      const logCalls = getLogCalls(fetchMock);
      const traceCalls = getTraceCalls(fetchMock);
      expect(logCalls.length).toBe(1);
      expect(traceCalls.length).toBe(1);

      logger.destroy();
    });

    it("query string is ignored when matching paths", async () => {
      const logger = new FlareLog({
        apiKey: "fl_test",
        workerMode: true,
        ignorePaths: ["/favicon.ico"],
      });
      const handler = workerFetch(logger, async () => {
        logger.info("should be skipped");
        return new Response(null, { status: 204 });
      });

      // Browser usually sends favicon as /favicon.ico with no query, but be safe.
      await handler(new Request("https://example.com/favicon.ico?v=2"), {}, { waitUntil: vi.fn() });
      await new Promise((r) => setTimeout(r, 50));

      expect(getLogCalls(fetchMock).length).toBe(0);
      expect(getTraceCalls(fetchMock).length).toBe(0);

      logger.destroy();
    });

    it("multiple patterns: any match triggers bypass", async () => {
      const logger = new FlareLog({
        apiKey: "fl_test",
        workerMode: true,
        ignorePaths: ["/favicon.ico", "/robots.txt", /^\/static\//],
      });
      const handler = workerFetch(logger, async () => new Response("ok"));

      const ctx = { waitUntil: vi.fn() };
      await handler(new Request("https://example.com/favicon.ico"), {}, ctx);
      await handler(new Request("https://example.com/robots.txt"), {}, ctx);
      await handler(new Request("https://example.com/static/img/logo.png"), {}, ctx);
      await new Promise((r) => setTimeout(r, 50));

      expect(getLogCalls(fetchMock).length).toBe(0);
      expect(getTraceCalls(fetchMock).length).toBe(0);

      logger.destroy();
    });

    it("function matcher that throws is swallowed (request still succeeds, instrumentation continues)", async () => {
      const logger = new FlareLog({
        apiKey: "fl_test",
        workerMode: true,
        ignorePaths: [
          () => {
            throw new Error("matcher bug");
          },
        ],
      });
      const handler = workerFetch(logger, async () => {
        logger.info("still works");
        return new Response("ok");
      });

      // Throwing matcher is treated as "no match" → request is instrumented normally.
      const ctx = { waitUntil: vi.fn() };
      await handler(new Request("https://example.com/api"), {}, ctx);
      await new Promise((r) => setTimeout(r, 50));

      const logCalls = getLogCalls(fetchMock);
      expect(logCalls.length).toBe(1);

      logger.destroy();
    });

    it("empty ignorePaths array (default) — only OPTIONS/HEAD bypass applies", async () => {
      const logger = new FlareLog({ apiKey: "fl_test", workerMode: true });
      const handler = workerFetch(logger, async () => {
        logger.info("hello");
        return new Response("ok");
      });

      // GET /favicon.ico with no ignorePaths → IS instrumented (browser-noise
      // behavior is opt-in via ignorePaths).
      const ctx = { waitUntil: vi.fn() };
      await handler(new Request("https://example.com/favicon.ico"), {}, ctx);
      await new Promise((r) => setTimeout(r, 50));

      expect(getLogCalls(fetchMock).length).toBe(1);
      expect(getTraceCalls(fetchMock).length).toBe(1);

      logger.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Flarelog() factory + pagesFunction() integration
  // -------------------------------------------------------------------------

  describe("flarelog() factory passes ignorePaths through", () => {
    it("flarelog({ ignorePaths: ['/favicon.ico'] }) — factory config reaches withRequest", async () => {
      const logger = flarelog({
        apiKey: "fl_test",
        workerMode: true,
        ignorePaths: ["/favicon.ico"],
        // Disable auto-capture so test output doesn't pollute assertions.
        autoCapture: { console: false, globalErrors: false, rejections: false },
      });

      const handler = workerFetch(logger, async () => {
        logger.info("favicon hit");
        return new Response(null, { status: 204 });
      });

      await handler(new Request("https://example.com/favicon.ico"), {}, { waitUntil: vi.fn() });
      await new Promise((r) => setTimeout(r, 50));

      expect(getLogCalls(fetchMock).length).toBe(0);
      expect(getTraceCalls(fetchMock).length).toBe(0);

      logger.destroy();
    });
  });

  describe("pagesFunction() honors the same bypass", () => {
    it("OPTIONS request via pagesFunction bypasses instrumentation", async () => {
      const logger = new FlareLog({ apiKey: "fl_test", workerMode: true });
      const handler = pagesFunction(logger, async () => new Response("ok"));

      const context = {
        request: new Request("https://example.com/api", { method: "OPTIONS" }),
        env: {},
        waitUntil: vi.fn(),
      };

      await handler(context);
      await new Promise((r) => setTimeout(r, 50));

      expect(getLogCalls(fetchMock).length).toBe(0);
      expect(getTraceCalls(fetchMock).length).toBe(0);

      logger.destroy();
    });

    it("ignorePaths config is honored by pagesFunction", async () => {
      const logger = new FlareLog({
        apiKey: "fl_test",
        workerMode: true,
        ignorePaths: ["/favicon.ico"],
      });
      const handler = pagesFunction(logger, async () => new Response(null, { status: 204 }));

      const context = {
        request: new Request("https://example.com/favicon.ico"),
        env: {},
        waitUntil: vi.fn(),
      };

      await handler(context);
      await new Promise((r) => setTimeout(r, 50));

      expect(getLogCalls(fetchMock).length).toBe(0);
      expect(getTraceCalls(fetchMock).length).toBe(0);

      logger.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // User's exact reported scenario — 8 logs + 2 requests (page + favicon)
  // -------------------------------------------------------------------------

  describe("user's reported scenario — page + favicon browser load", () => {
    it("without ignorePaths: 2 page-load requests → 2 /v1/logs + 2 /v1/traces (the bug)", async () => {
      const logger = new FlareLog({ apiKey: "fl_test", workerMode: true });
      const handler = workerFetch(logger, async () => {
        for (let i = 1; i <= 8; i++) logger.info(`Hello haters! #${i}`);
        return new Response("Hello, The World!");
      });

      // Simulate browser: page request + favicon request
      await handler(new Request("https://example.com/"), {}, { waitUntil: vi.fn() });
      await handler(new Request("https://example.com/favicon.ico"), {}, { waitUntil: vi.fn() });
      await new Promise((r) => setTimeout(r, 50));

      // This is the bug the user reported — 2 calls per endpoint, each with 8 logs.
      expect(getLogCalls(fetchMock).length).toBe(2);
      expect(getTraceCalls(fetchMock).length).toBe(2);
      expect(extractOtlpLogs(getLogCalls(fetchMock)[0]).length).toBe(8);
      expect(extractOtlpLogs(getLogCalls(fetchMock)[1]).length).toBe(8);

      logger.destroy();
    });

    it("WITH ignorePaths: ['/favicon.ico'] — page request still instrumented, favicon skipped → 1 call per endpoint", async () => {
      const logger = new FlareLog({
        apiKey: "fl_test",
        workerMode: true,
        ignorePaths: ["/favicon.ico"],
      });
      const handler = workerFetch(logger, async () => {
        for (let i = 1; i <= 8; i++) logger.info(`Hello haters! #${i}`);
        return new Response("Hello, The World!");
      });

      // Simulate browser: page request + favicon request
      await handler(new Request("https://example.com/"), {}, { waitUntil: vi.fn() });
      await handler(new Request("https://example.com/favicon.ico"), {}, { waitUntil: vi.fn() });
      await new Promise((r) => setTimeout(r, 50));

      // ✅ The fix: only the page request is instrumented.
      expect(getLogCalls(fetchMock).length).toBe(1);
      expect(getTraceCalls(fetchMock).length).toBe(1);
      expect(extractOtlpLogs(getLogCalls(fetchMock)[0]).length).toBe(8);

      logger.destroy();
    });
  });
});
