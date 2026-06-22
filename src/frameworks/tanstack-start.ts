import type { FlareLog, FlareLogChild } from "../client";

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

// Extended context passed to withTanStackStart handlers
interface TanStackContext extends Context {
  logger: FlareLogChild; // Fixed: Changed from FlareLog to FlareLogChild
  traceId: string;
}

// ─── Shared setup ────────────────────────────────────────────────────────────

function resolveTraceId(headers: Request["headers"]): string {
  const raw = headers["x-trace-id"];
  if (Array.isArray(raw)) return raw[0] ?? crypto.randomUUID();
  return raw ?? crypto.randomUUID();
}

function resolveLevel(status: number): "ERROR" | "WARN" | "INFO" {
  if (status >= 500) return "ERROR";
  if (status >= 400) return "WARN";
  return "INFO";
}

function createChildLogger(logger: FlareLog, ctx: Context, traceId: string): FlareLogChild {
  return logger.child({
    source: "tanstack-start",
    traceId,
    method: ctx.request.method,
    path: ctx.request.url,
    ip: ctx.request.ip,
  });
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * TanStack Start middleware for automatic request logging.
 *
 * Attaches `ctx.get("logger")` with request context, logs completion
 * with duration and status, and auto-generates a traceId.
 *
 * @example
 * ```typescript
 * const logger = flarelog({ apiKey });
 * app.use(tanstackStartMiddleware(logger));
 * ```
 */
export function tanstackStartMiddleware(logger: FlareLog) {
  return async (ctx: Context, next: NextFunction) => {
    const traceId = resolveTraceId(ctx.request.headers);
    const child = createChildLogger(logger, ctx, traceId);
    ctx.set("logger", child);

    const start = Date.now();
    try {
      await next();
      const duration = Date.now() - start;
      const status = ctx.response.status;
      child.log(resolveLevel(status), "Request completed", { status, durationMs: duration });
    } catch (err) {
      child.logError(err, {
        message: "Request failed",
        metadata: { durationMs: Date.now() - start },
      });
      throw err;
    }
  };
}

// ─── Route wrapper ────────────────────────────────────────────────────────────

/**
 * TanStack Start API route wrapper with automatic logging.
 *
 * Passes an extended context with `logger` and `traceId` to the handler,
 * logs completion with duration and status, and captures errors automatically.
 *
 * @example
 * ```typescript
 * const logger = flarelog({ apiKey });
 *
 * export default withTanStackStart(logger, async (ctx) => {
 * ctx.logger.info("Processing request");
 * return new Response(JSON.stringify(await fetchData()));
 * });
 * ```
 */
export function withTanStackStart<T>(
  logger: FlareLog,
  handler: (ctx: TanStackContext) => Promise<T>
) {
  return async (ctx: Context) => {
    const traceId = resolveTraceId(ctx.request.headers);
    const child = createChildLogger(logger, ctx, traceId);
    ctx.set("logger", child);

    const extCtx: TanStackContext = Object.assign(ctx, { logger: child, traceId });

    const start = Date.now();
    try {
      const result = await handler(extCtx);
      const duration = Date.now() - start;
      // Read status from ctx.response, not the result — avoids false positives
      // on result objects that incidentally carry a `status` field.
      const status = ctx.response.status ?? 200;
      child.log(resolveLevel(status), "API request completed", { status, durationMs: duration });
      return result;
    } catch (err) {
      child.logError(err, {
        message: "API request failed",
        metadata: { durationMs: Date.now() - start },
      });
      throw err;
    }
  };
}