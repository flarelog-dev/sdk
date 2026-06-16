import type { FlareLogConfig } from "./types";
import { FlareLog } from "./client";

/**
 * Detect environment from runtime context.
 * Works in Node.js, Cloudflare Workers, and browsers.
 */
function detectEnvironment(): Partial<FlareLogConfig> {
  const detected: Partial<FlareLogConfig> = {};

  try {
    // Node.js
    if (typeof (globalThis as any).process !== "undefined" && (globalThis as any).process.version) {
      const process = (globalThis as any).process;
      detected.environment = process.env?.NODE_ENV || "development";
      detected.release = process.env?.npm_package_version || 
                         process.env?.VERCEL_GIT_COMMIT_SHA ||
                         process.env?.CF_PAGES_COMMIT_SHA ||
                         "";
      detected.serverName = process.env?.HOSTNAME || 
                            process.env?.COMPUTERNAME ||
                            "";
    }
    // Browser
    else if (typeof window !== "undefined") {
      detected.environment = "production";
    }
    // Cloudflare Workers (navigator.userAgent check)
    else if (typeof navigator !== "undefined" && navigator.userAgent?.includes("Cloudflare-Workers")) {
      detected.environment = "production";
    }
    // Default
    else {
      detected.environment = "development";
    }
  } catch {
    detected.environment = "development";
  }

  return detected;
}

/**
 * Branded factory function to create a FlareLog logger with sensible defaults.
 * Auto-detects environment, release, and serverName from runtime context.
 * 
 * @example
 * ```typescript
 * import { flarelog } from "@flarelog/sdk";
 * 
 * const logger = flarelog({
 *   apiKey: env.FLARELOG_API_KEY,
 *   project: "my-worker",
 * });
 * // Auto-detects: environment, release, serverName
 * // Auto-enables: console, globalErrors, rejections capture
 * ```
 */
export function flarelog(config: FlareLogConfig): FlareLog {
  const detected = detectEnvironment();
  
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
