import type { FlareLog } from "../client";

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
}

interface Next {
  (): Promise<void>;
}

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
export function honoMiddleware(logger: FlareLog) {
  return async (c: Context, next: Next) => {
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
