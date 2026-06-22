import type { FlareLog } from "../client";

// Inline types to avoid TanStack Start dependency
interface Request {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
  ip?: string;
}

interface Response {
  status: number;
  statusText: string;
  headers: Headers;
}

interface Context {
  request: Request;
  response: Response;
  set(key: string, value: unknown): void;
  get(key: string): unknown;
}

interface NextFunction {
  (): Promise<void>;
}

/**
 * TanStack Start middleware for automatic request logging.
 * 
 * - Attaches `ctx.get("logger")` with request context
 * - Logs request completion with duration and status
 * - Auto-generates traceId from header or crypto
 * 
 * @example
 * ```typescript
 * import { flarelog } from "@flarelog/sdk";
 * import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";
 * 
 * const logger = flarelog({ apiKey });
 * 
 * // In your TanStack Start app
 * app.use(tanstackStartMiddleware(logger));
 * ```
 */
export function tanstackStartMiddleware(logger: FlareLog) {
  return async (ctx: Context, next: NextFunction) => {
    const traceId = (ctx.request.headers["x-trace-id"] as string) || crypto.randomUUID();

    const child = logger.child({
      source: "tanstack-start",
      traceId,
      method: ctx.request.method,
      path: ctx.request.url,
      ip: ctx.request.ip,
    });

    ctx.set("logger", child);

    const start = Date.now();
    try {
      await next();
      const duration = Date.now() - start;
      const status = ctx.response.status;
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

/**
 * TanStack Start API route wrapper with automatic logging.
 * 
 * - Attaches `ctx.get("logger")` with request context
 * - Logs request completion with duration and status
 * - Captures errors automatically
 * 
 * @example
 * ```typescript
 * import { flarelog } from "@flarelog/sdk";
 * import { withTanStackStart } from "@flarelog/sdk/tanstack-start";
 * 
 * const logger = flarelog({ apiKey });
 * 
 * export default withTanStackStart(logger, async (ctx) => {
 *   const logger = ctx.get("logger");
 *   logger.info("Processing request");
 *   const data = await fetchData();
 *   return new Response(JSON.stringify(data));
 * });
 * ```
 */
export function withTanStackStart<T>(
  logger: FlareLog,
  handler: (ctx: Context & { logger: FlareLog; traceId: string }) => Promise<T>
) {
  return async (ctx: Context) => {
    const traceId = (ctx.request.headers["x-trace-id"] as string) || crypto.randomUUID();

    const child = logger.child({
      source: "tanstack-start",
      traceId,
      method: ctx.request.method,
      path: ctx.request.url,
    });

    ctx.set("logger", child);

    const start = Date.now();
    try {
      const result = await handler(ctx as any);
      const duration = Date.now() - start;
      const status = (result as any)?.status ?? 200;
      const level = status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO";

      child.log(level, "API request completed", {
        status,
        durationMs: duration,
      });
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      child.logError(err, {
        message: "API request failed",
        metadata: { durationMs: duration },
      });
      throw err;
    }
  };
}
