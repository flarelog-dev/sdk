import type { FlareLog, FlareLogChild } from "../client";
import { autoLogger } from "./auto-logger";

// Inline types to avoid Hono dependency
interface Context {
  req: {
    header(name: string): string | undefined;
    method: string;
    path: string;
  };
  res: {
    status: number;
  };
  set(key: string, value: unknown): void;
  /**
   * Hono on Cloudflare Workers exposes the Worker `env` bindings here.
   * On Node/Bun, this is typically undefined or an empty object.
   */
  env?: Record<string, string | undefined>;
}

interface Next {
  (): Promise<void>;
}

/**
 * Logger input accepted by {@link honoMiddleware}.
 *
 * - `undefined` (or omitted): the SDK auto-creates a logger by reading
 *   `FLARELOG_API_KEY` from `c.env` (Hono on Workers) or `process.env`
 *   (Hono on Node/Bun). Recommended for new projects.
 * - A {@link FlareLog} instance: eager-init pattern.
 * - A factory `(c: Context) => FlareLog | Promise<FlareLog>`: full custom
 *   control, with access to the Hono request context.
 */
export type HonoLoggerInput =
  | FlareLog
  | ((c: Context) => FlareLog | Promise<FlareLog>)
  | undefined;

function resolveTraceId(c: Context): string {
  const raw = c.req.header("x-trace-id");
  return raw || crypto.randomUUID();
}

function resolveLevel(status: number | undefined): "ERROR" | "WARN" | "INFO" {
  if (status === undefined) return "INFO";
  if (status >= 500) return "ERROR";
  if (status >= 400) return "WARN";
  return "INFO";
}

/**
 * Hono middleware for automatic request logging.
 *
 * - Attaches `c.get("logger")` with request context (traceId/method/path)
 * - Logs request completion with duration and status
 * - Auto-generates traceId from `x-trace-id` header or `crypto.randomUUID()`
 * - Calls `logger.flush()` after each request so logs aren't dropped on
 *   short-lived runtimes (Cloudflare Workers)
 *
 * @example Zero-config — works on Hono + Cloudflare Workers, Node, Bun
 * ```typescript
 * import { Hono } from "hono";
 * import { honoMiddleware } from "@flarelog/sdk/hono";
 *
 * const app = new Hono();
 * app.use("*", honoMiddleware());
 * ```
 * The SDK auto-detects the runtime and reads `FLARELOG_API_KEY` from
 * `c.env` (Workers) or `process.env` (Node/Bun).
 *
 * @example Eager logger — custom config
 * ```typescript
 * import { flarelog } from "@flarelog/sdk";
 * const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY!, sampleRate: 0.1 });
 * app.use("*", honoMiddleware(logger));
 * ```
 *
 * @example Factory — per-request logger (e.g. multi-tenant)
 * ```typescript
 * app.use("*", honoMiddleware((c) => flarelog({ apiKey: c.env.TENANT_KEY })));
 * ```
 */
export function honoMiddleware(loggerOrFactory?: HonoLoggerInput) {
  // Cache for the auto-logger mode. One logger per Worker isolate — Hono on
  // Workers reuses the same app instance across requests, so this avoids
  // re-creating the logger (and re-reading the env) per request.
  let autoLoggerPromise: Promise<FlareLog> | null = null;

  return async (c: Context, next: Next) => {
    let logger: FlareLog;
    if (loggerOrFactory === undefined) {
      // Auto mode: pass c.env so we can read Worker bindings directly
      // (faster than probing getEvent() and works on Hono's standard API).
      if (!autoLoggerPromise) autoLoggerPromise = autoLogger(c.env);
      logger = await autoLoggerPromise;
    } else if (typeof loggerOrFactory === "function") {
      logger = await loggerOrFactory(c);
    } else {
      logger = loggerOrFactory;
    }

    const traceId = resolveTraceId(c);
    const child: FlareLogChild = logger.child({
      source: "hono",
      traceId,
      method: c.req.method,
      path: c.req.path,
    });

    c.set("logger", child);

    const start = Date.now();
    try {
      await next();
      const duration = Date.now() - start;
      const status = c.res.status;
      const level = resolveLevel(status);

      child.log(level, "Request completed", {
        status,
        durationMs: duration,
      });
      // Guarantee delivery on short-lived runtimes (Cloudflare Workers).
      await logger.flush().catch(() => {
        /* flush errors are surfaced by the transport's own retry/backoff */
      });
    } catch (err) {
      const duration = Date.now() - start;
      child.logError(err, {
        message: "Request failed",
        metadata: { durationMs: duration },
      });
      await logger.flush().catch(() => {
        /* same as above */
      });
      throw err;
    }
  };
}
