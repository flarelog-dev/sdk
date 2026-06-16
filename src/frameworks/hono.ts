import type { FlareLog } from "../client";
import type { MiddlewareHandler } from "hono";

/**
 * Hono middleware for automatic request logging.
 * 
 * - Attaches `c.get("logger")` with request context
 * - Logs request completion with duration and status
 * - Auto-generates traceId from header or crypto
 * 
 * @example
 * ```typescript
 * import { flarelog } from "@flarelog/sdk";
 * import { honoMiddleware } from "@flarelog/sdk/hono";
 * 
 * const logger = flarelog({ apiKey, project: "api" });
 * app.use("*", honoMiddleware(logger));
 * ```
 */
export function honoMiddleware(logger: FlareLog): MiddlewareHandler {
  return async (c, next) => {
    const traceId = c.req.header("x-trace-id") || crypto.randomUUID();

    const child = logger.child({
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
      const level = status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO";

      child.log(level, "Request completed", {
        status,
        durationMs: duration,
      });
    } catch (err) {
      const duration = Date.now() - start;
      child.logError(err, {
        message: "Request failed",
        metadata: { durationMs: duration },
      });
      throw err;
    }
  };
}
