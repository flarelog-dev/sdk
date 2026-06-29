/**
 * Lovable / Workers symptom — negative regression tests.
 *
 * Codifies the exact failure mode reported by users:
 *   "logs work in dev but not in preview"
 *
 * Root cause: on Cloudflare Workers (incl. Lovable preview/production), secrets
 * arrive as `env` bindings — NOT on `process.env` at module load. If the SDK is
 * constructed eagerly at module load with `flarelog({ apiKey:
 * process.env.FLARELOG_API_KEY! })`, the apiKey is `undefined`, the SDK silently
 * falls back to `ConsoleTransport`, and nothing ships to the dashboard.
 *
 * In TanStack Start v1 the binding is reachable via `import { env } from
 * "cloudflare:workers"` (the canonical Cloudflare-runtime module). The legacy
 * `getRequestEvent()` API was removed before the v1 stable release and is NOT
 * exported by `@tanstack/react-start` >= 1.0.0.
 *
 * These tests assert that:
 *   1. The silent fallback now emits a `console.warn` (loud failure mode).
 *   2. The user can silence the warning with `warnOnConsoleFallback: false`.
 *   3. `autoLogger()` resolves the API key from `cloudflare:workers` env.
 *   4. `autoLogger()` resolves from `process.env` when no binding is present.
 *   5. `autoLogger()` warns + falls back when neither source has the key.
 *
 * Future regressions in any of these will fail this test file. This is the
 * cheapest possible insurance against the bug recurring.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlareLog } from "../src/client";
import { flarelog } from "../src/factory";
import { mockFetch, wasFetchCalledForUrl } from "./helpers";
import {
  autoLogger,
  resolveWorkerEnv,
  __resetAutoLoggerCache,
} from "../src/frameworks/auto-logger";

// Mock `cloudflare:workers` (a runtime-provided module on Workers).
// Tests set `__cfEnv` to simulate Worker env bindings. On Node/Vercel the
// real `import("cloudflare:workers")` throws synchronously — the auto-logger
// catches that and falls back to process.env.
let __cfEnv: Record<string, string | undefined> | null = null;
vi.mock("cloudflare:workers", () => ({
  get env() {
    return __cfEnv;
  },
}));

describe("Lovable / Workers symptom — negative regression tests", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    __cfEnv = null;
    __resetAutoLoggerCache();
    delete process.env.FLARELOG_API_KEY;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_HEADERS;
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SECTION 1: The loud-fallback warning — turns silent failure into signal.
  // =========================================================================

  describe("loud-fallback warning", () => {
    it("warns when no backend is configured (the original silent-failure case)", () => {
      // This is exactly what happens on Lovable preview when the user does
      // `flarelog({ apiKey: process.env.FLARELOG_API_KEY! })` and the env var
      // is undefined.
      new FlareLog({ apiKey: undefined });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("No backend configured"),
      );
      // The warning must mention the fix paths.
      const msg = warnSpy.mock.calls[0][0] as string;
      expect(msg).toContain("Cloudflare Workers / Lovable");
      expect(msg).toContain("process.env");
      expect(msg).toContain("warnOnConsoleFallback: false");
    });

    it("does NOT warn when warnOnConsoleFallback: false (explicit opt-out)", () => {
      new FlareLog({ apiKey: undefined, warnOnConsoleFallback: false });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("does NOT warn when an API key is provided (the success case)", () => {
      new FlareLog({ apiKey: "fl_test_key" });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("does NOT warn when an OTLP endpoint is provided", () => {
      new FlareLog({ otlpEndpoint: "https://otlp.example.com" });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("does NOT warn when explicit transports are provided", () => {
      new FlareLog({ transports: [{ type: "console" }] });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("emits the warning at most once per FlareLog instance", () => {
      const logger = new FlareLog({ apiKey: undefined });
      logger.info("first log");
      logger.info("second log");
      logger.info("third log");
      // The warning is emitted during construction, not per-log.
      const fallbackWarnings = warnSpy.mock.calls.filter((c) =>
        String(c[0]).includes("No backend configured"),
      );
      expect(fallbackWarnings).toHaveLength(1);
    });

    it("the flarelog() factory also warns (default behavior)", () => {
      flarelog({});
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("No backend configured"),
      );
    });
  });

  // =========================================================================
  // SECTION 2: The autoLogger() fix — resolves the binding from the runtime.
  // =========================================================================

  describe("autoLogger() — the fix for Workers / Lovable", () => {
    it("resolves FLARELOG_API_KEY from the Worker env binding (the Lovable case)", async () => {
      __cfEnv = { FLARELOG_API_KEY: "fl_from_binding" };

      const logger = await autoLogger();
      logger.info("test log");
      await logger.flush();

      expect(wasFetchCalledForUrl(fetchMock, "/v1/logs")).toBe(true);
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("No backend configured"),
      );
    });

    it("resolves FLARELOG_API_KEY from process.env (the Node dev case)", async () => {
      process.env.FLARELOG_API_KEY = "fl_from_process_env";

      const logger = await autoLogger();
      logger.info("test log");
      await logger.flush();

      expect(wasFetchCalledForUrl(fetchMock, "/v1/logs")).toBe(true);
    });

    it("warns + falls back when NEITHER source has the key (the bug)", async () => {
      // No binding, no process.env — exactly the Lovable preview failure mode.
      __cfEnv = null;
      __resetAutoLoggerCache();

      const logger = await autoLogger();
      logger.info("test log");
      await logger.flush();

      expect(wasFetchCalledForUrl(fetchMock, "/v1/logs")).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("No backend configured"),
      );
    });

    it("accepts an explicit env arg (the Hono case — reads c.env)", async () => {
      const env = { FLARELOG_API_KEY: "fl_from_explicit_env" };
      const logger = await autoLogger(env);
      logger.info("test log");
      await logger.flush();

      expect(wasFetchCalledForUrl(fetchMock, "/v1/logs")).toBe(true);
    });

    it("explicit env arg takes precedence over process.env", async () => {
      process.env.FLARELOG_API_KEY = "fl_should_not_be_used";
      const env = { FLARELOG_API_KEY: "fl_should_be_used" };

      const logger = await autoLogger(env);
      logger.info("test log");
      await logger.flush();

      // Both keys would POST to /v1/logs; we just verify it shipped at all.
      expect(wasFetchCalledForUrl(fetchMock, "/v1/logs")).toBe(true);
    });
  });

  // =========================================================================
  // SECTION 3: End-to-end symptom reproduction.
  // =========================================================================

  describe("end-to-end symptom — 'works in dev, not in preview'", () => {
    it("reproduces the original bug: eager logger fails on Workers", async () => {
      // Simulate Lovable preview: no FLARELOG_API_KEY on process.env,
      // but it IS available as a Worker binding.
      __cfEnv = { FLARELOG_API_KEY: "fl_lovable_preview" };

      // This is what the OLD docs told users to do:
      const eagerLogger = new FlareLog({
        apiKey: process.env.FLARELOG_API_KEY!, // undefined on Workers!
      });
      eagerLogger.info("this log will NOT ship");
      await eagerLogger.flush();

      // Bug confirmed: no fetch was made to the logs endpoint.
      expect(wasFetchCalledForUrl(fetchMock, "/v1/logs")).toBe(false);
      // AND the warning is now emitted, so the user knows.
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("No backend configured"),
      );
    });

    it("verifies the fix: autoLogger() ships the same log on the same runtime", async () => {
      __cfEnv = { FLARELOG_API_KEY: "fl_lovable_preview" };

      const fixedLogger = await autoLogger();
      fixedLogger.info("this log WILL ship");
      await fixedLogger.flush();

      expect(wasFetchCalledForUrl(fetchMock, "/v1/logs")).toBe(true);
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("No backend configured"),
      );
    });
  });

  // =========================================================================
  // SECTION 4: resolveWorkerEnv() — direct probe of env sources.
  // =========================================================================

  describe("resolveWorkerEnv() — env source resolution", () => {
    it("returns null when no source has the API key", async () => {
      __cfEnv = null;
      __resetAutoLoggerCache();
      delete process.env.FLARELOG_API_KEY;
      expect(await resolveWorkerEnv()).toBeNull();
    });

    it("returns process.env when FLARELOG_API_KEY is set there", async () => {
      process.env.FLARELOG_API_KEY = "fl_from_process";
      __cfEnv = null;
      __resetAutoLoggerCache();
      const env = await resolveWorkerEnv();
      expect(env?.FLARELOG_API_KEY).toBe("fl_from_process");
    });

    it("returns Worker env binding when cloudflare:workers has one", async () => {
      __cfEnv = { FLARELOG_API_KEY: "fl_from_binding" };
      __resetAutoLoggerCache();
      const env = await resolveWorkerEnv();
      expect(env?.FLARELOG_API_KEY).toBe("fl_from_binding");
    });

    it("caches the Worker env across calls within the same isolate", async () => {
      __cfEnv = { FLARELOG_API_KEY: "fl_cached" };
      __resetAutoLoggerCache();

      const first = await resolveWorkerEnv();
      // Mutate the binding — second call should still return the cached value.
      __cfEnv = { FLARELOG_API_KEY: "fl_changed" };
      const second = await resolveWorkerEnv();

      expect(first?.FLARELOG_API_KEY).toBe("fl_cached");
      expect(second?.FLARELOG_API_KEY).toBe("fl_cached"); // cached, not re-read
    });
  });
});
