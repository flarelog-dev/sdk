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

/**
 * Logger input accepted by `tanstackStartMiddleware`.
 *
 * - A {@link FlareLog} instance: the classic, eager-init pattern. Use this when
 *   `process.env.FLARELOG_API_KEY` is reachable at module load (Node.js dev,
 *   Node.js production, Vercel, etc.).
 * - A factory `() => FlareLog | Promise<FlareLog>`: lazy-init pattern. Use this
 *   when the API key is only available inside the request handler — e.g. on
 *   Cloudflare Workers (including Lovable preview builds), where secrets arrive
 *   as Worker `env` bindings and `process.env` is `undefined`. The factory is
 *   invoked on every request, so it can read the per-request `env` via
 *   `getEvent()` from `vinxi/http`.
 */
export type TanstackStartLoggerInput =
  | FlareLog
  | (() => FlareLog | Promise<FlareLog>);

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
 * The middleware also calls `await logger.flush()` after each request (both on
 * success and on error) to guarantee telemetry delivery on short-lived
 * runtimes. This is critical on Cloudflare Workers / Lovable preview builds,
 * where the Worker may be suspended the moment the response is returned —
 * without an explicit flush, in-flight `fetch()` calls to the OTLP/Flarelog
 * backend get dropped. On long-lived runtimes (Node, Vercel) the extra flush
 * is a cheap no-op because the batch processor already drained.
 *
 * Note: TanStack Start does not expose a response status reader from within
 * request middleware (only setters like `setResponseStatus`). When `next()`
 * returns a result carrying a numeric `status` field it is used for level
 * mapping; otherwise completion is logged at INFO.
 *
 * @example Eager logger — Node.js dev / Vercel
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
 *
 * @example Lazy logger — Cloudflare Workers / Lovable preview
 * ```typescript
 * // src/start.ts
 * import { createStart } from "@tanstack/react-start";
 * import { flarelog, type FlareLog } from "@flarelog/sdk";
 * import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";
 * import { getEvent } from "vinxi/http";
 *
 * let _logger: FlareLog | null = null;
 * function getLogger(): FlareLog {
 *   if (_logger) return _logger;
 *   // On Lovable/Workers, secrets arrive as bindings on the request event,
 *   // NOT on process.env. Falls back to process.env for local dev.
 *   const event = getEvent() as unknown as {
 *     cloudflare?: { env?: Record<string, string | undefined> };
 *     context?: { cloudflare?: { env?: Record<string, string | undefined> } };
 *   };
 *   const env = event?.cloudflare?.env
 *     ?? event?.context?.cloudflare?.env
 *     ?? process.env;
 *   _logger = flarelog({
 *     apiKey: env.FLARELOG_API_KEY,
 *     environment: env.FLARELOG_ENVIRONMENT ?? "production",
 *     release: env.FLARELOG_RELEASE,
 *     workerMode: true,
 *   });
 *   return _logger;
 * }
 *
 * export const startInstance = createStart(() => ({
 *   requestMiddleware: [tanstackStartMiddleware(getLogger)],
 * }));
 * ```
 */
export function tanstackStartMiddleware(
  loggerOrFactory: TanstackStartLoggerInput,
): unknown {
  return createMiddleware().server(async ({ next, request }) => {
    const logger =
      typeof loggerOrFactory === "function"
        ? await loggerOrFactory()
        : loggerOrFactory;

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
      // Guarantee delivery on short-lived runtimes (Cloudflare Workers / Lovable).
      // On Node/Vercel this is a no-op once the batch processor has drained.
      await logger.flush().catch(() => {
        /* flush errors are surfaced by the transport's own retry/backoff */
      });
      return result;
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
