import type { FlareLog, FlareLogChild } from "../client";
import { createMiddleware } from "@tanstack/react-start";

type RequestLike = {
  method: string;
  url: string;
  headers: {
    get(name: string): string | null;
  };
};

function resolveTraceId(request: RequestLike): string {
  const raw = request.headers.get("x-trace-id");
  return raw ?? crypto.randomUUID();
}

function resolveLevel(status: number | undefined): "ERROR" | "WARN" | "INFO" {
  if (status === undefined) return "INFO";
  if (status >= 500) return "ERROR";
  if (status >= 400) return "WARN";
  return "INFO";
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function createChildLogger(
  logger: FlareLog,
  request: RequestLike,
  traceId: string,
): FlareLogChild {
  return logger.child({
    source: "tanstack-start",
    traceId,
    method: request.method,
    path: pathOf(request.url),
  });
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * TanStack Start request middleware for automatic request logging.
 *
 * Composes with TanStack Start's real `createMiddleware()` from
 * `@tanstack/react-start`. Register it globally in `src/start.ts` via
 * `createStart(() => ({ requestMiddleware: [tanstackStartMiddleware(logger)] }))`,
 * per-route via `createFileRoute(...)({ server: { middleware: [...] } })`, or
 * per server function via `createServerFn().middleware([...])`.
 *
 * Attaches `context.logger` (a child logger with traceId/method/path) and
 * `context.traceId` to the downstream context, logs request completion with
 * duration, and captures thrown errors.
 *
 * Note: TanStack Start does not expose a response status reader from within
 * request middleware (only setters like `setResponseStatus`). When `next()`
 * returns a result carrying a numeric `status` field it is used for level
 * mapping; otherwise completion is logged at INFO.
 *
 * @example
 * ```typescript
 * // src/start.ts
 * import { createStart } from "@tanstack/react-start";
 * import { flarelog } from "@flarelog/sdk";
 * import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";
 *
 * const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY! });
 *
 * export const startInstance = createStart(() => ({
 *   requestMiddleware: [tanstackStartMiddleware(logger)],
 * }));
 * ```
 */
export function tanstackStartMiddleware(logger: FlareLog): unknown {
  return createMiddleware().server(async ({ next, request }) => {
    const req = request as unknown as RequestLike;
    const traceId = resolveTraceId(req);
    const child = createChildLogger(logger, req, traceId);

    const start = Date.now();
    try {
      const result = await next({
        context: { logger: child, traceId },
      });
      const duration = Date.now() - start;
      const status =
        typeof (result as { status?: unknown })?.status === "number"
          ? (result as { status: number }).status
          : undefined;
      child.log(
        resolveLevel(status),
        "Request completed",
        { status, durationMs: duration },
      );
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      child.logError(err, {
        message: "Request failed",
        metadata: { durationMs: duration },
      });
      throw err;
    }
  });
}

// ─── Deprecated wrapper ───────────────────────────────────────────────────────

/**
 * @deprecated `withTanStackStart` was built against a `app.use`-style API that
 * TanStack Start does not provide. It is retained only to surface a clear
 * migration error. Use `createServerFn().middleware([tanstackStartMiddleware(logger)])`
 * for per-server-function logging, or register `tanstackStartMiddleware`
 * globally via `createStart` in `src/start.ts`.
 *
 * @throws Always throws on invocation.
 */
export function withTanStackStart<T>(
  _logger: FlareLog,
  _handler: (ctx: unknown) => Promise<T>,
): (ctx: unknown) => Promise<T> {
  return async () => {
    throw new Error(
      "withTanStackStart is unsupported. TanStack Start has no `app.use` API. " +
        "Use createServerFn().middleware([tanstackStartMiddleware(logger)]) or " +
        "register tanstackStartMiddleware via createStart({ requestMiddleware: [...] }).",
    );
  };
}
