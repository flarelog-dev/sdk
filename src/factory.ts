import type { FlareLogConfig } from "./types";
import { FlareLog } from "./client";

/**
 * Detect environment from runtime context.
 * Works in Node.js, Cloudflare Workers, and browsers.
 */
function detectEnvironmentDefaults(): Partial<FlareLogConfig> {
  const detected: Partial<FlareLogConfig> = {};

  try {
    // Node.js
    const proc = (globalThis as unknown as { process?: { version?: string; env?: Record<string, string | undefined> } }).process;
    if (proc && typeof proc.version === "string") {
      const env = proc.env ?? {};
      detected.environment = env.NODE_ENV || "development";
      detected.release =
        env.npm_package_version ||
        env.VERCEL_GIT_COMMIT_SHA ||
        env.CF_PAGES_COMMIT_SHA ||
        "";
      detected.serverName = env.HOSTNAME || env.COMPUTERNAME || "";
    }
    // Browser
    else if (typeof window !== "undefined") {
      detected.environment = "production";
    }
    // Cloudflare Workers (navigator.userAgent check)
    else if (typeof navigator !== "undefined" && navigator.userAgent?.includes("Cloudflare-Workers")) {
      detected.environment = "production";
    } else {
      detected.environment = "development";
    }
  } catch {
    detected.environment = "development";
  }

  return detected;
}

/**
 * Branded factory function to create a FlareLog logger with sensible defaults.
 *
 * v2 is OTel-native. The `flarelog()` factory:
 * - Auto-detects environment, release, and serverName from runtime context
 * - Auto-detects transports from env vars (OTEL_EXPORTER_OTLP_*, FLARELOG_API_KEY)
 * - Auto-enables console, globalErrors, and rejections capture
 * - Falls back to console-only output when no backend is configured
 *
 * @example Zero config — console output
 * ```ts
 * const logger = flarelog({});
 * logger.info("Hello");  // → console (pretty-printed)
 * ```
 *
 * @example Grafana Cloud — no Flarelog API key needed
 * ```ts
 * // env: OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_HEADERS
 * const logger = flarelog({});
 * logger.info("Hello");  // → Grafana Cloud
 * ```
 *
 * @example Flarelog hosted
 * ```ts
 * // env: FLARELOG_API_KEY
 * const logger = flarelog({});
 * logger.info("Hello");  // → flarelog.dev dashboard
 * ```
 *
 * @example Explicit API key (v1 style, still supported)
 * ```ts
 * const logger = flarelog({ apiKey: "fl_your_key" });
 * ```
 */
export function flarelog(config: FlareLogConfig = {}): FlareLog {
  const detected = detectEnvironmentDefaults();

  return new FlareLog({
    ...detected,
    ...config,
    autoCapture: {
      console: true,
      globalErrors: true,
      rejections: true,
      ...config.autoCapture,
    },
  });
}
