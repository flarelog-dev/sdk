import type { FlareLog, FlareLogChild } from "../client";
import {
  autoLogger,
  __resetAutoLoggerCache,
  resolveWorkerEnv,
} from "./auto-logger";
import { createMiddleware } from "@tanstack/react-start";

// Re-export so existing imports from `@flarelog/sdk/tanstack-start` still work.
export { autoLogger, resolveWorkerEnv, __resetAutoLoggerCache };

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

/**
 * Extract the HTTP status code from the value returned by TanStack Start v1's
 * `next()` callback.
 *
 * TanStack Start v1's `RequestServerResult` shape is:
 *   `{ request, pathname, context, response: Response }`
 * — there is no top-level `status` field. Status lives on
 * `result.response.status`.
 *
 * `next()` may also return:
 *   - a raw `Response` (when middleware short-circuits with `new Response(...)`)
 *   - an object with a numeric `status` (older / custom middleware shapes)
 *
 * Returns `undefined` when no status can be found — callers fall back to INFO.
 */
function readResponseStatus(result: unknown): number | undefined {
  if (!result || typeof result !== "object") {
    // A raw `Response` is an object, so this branch only catches
    // non-object returns (e.g. `undefined` from a void middleware).
    return undefined;
  }

  // 1. TanStack Start v1 shape: `{ response: Response }`
  const r = result as { response?: { status?: unknown }; status?: unknown };
  if (typeof r.response?.status === "number") {
    return r.response.status;
  }

  // 2. Raw Response returned directly (short-circuit case)
  if (typeof r.status === "number") {
    return r.status;
  }

  return undefined;
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
 * Logger input accepted by {@link tanstackStartMiddleware}.
 *
 * - `undefined` (or omitted): the SDK auto-creates a logger by detecting the
 *   runtime and reading secrets from `process.env` (Node/Vercel) or the
 *   Worker `env` binding (Cloudflare Workers / Lovable). This is the
 *   recommended form for new projects — see the example in the JSDoc below.
 * - A {@link FlareLog} instance: the classic eager-init pattern. Use this
 *   when you've already constructed a logger with custom config.
 * - A factory `() => FlareLog | Promise<FlareLog>`: for full custom control.
 */
export type TanstackStartLoggerInput =
  | FlareLog
  | (() => FlareLog | Promise<FlareLog>)
  | undefined;

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * TanStack Start request middleware for automatic request logging.
 *
 * Composes with TanStack Start's real `createMiddleware()` from
 * `@tanstack/react-start`. Register it globally in `src/start.ts` via
 * `createStart(() => ({ requestMiddleware: [tanstackStartMiddleware()] }))`,
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
 * Note: TanStack Start v1's `next()` returns either a raw `Response` (when a
 * middleware short-circuits) or a `RequestServerResult` shaped like
 * `{ request, pathname, context, response }`. The middleware reads
 * `result.response.status` (or `result.status` for raw Responses) to map the
 * HTTP status to a log level (4xx → WARN, 5xx → ERROR). When no status is
 * available, completion logs at INFO.
 *
 * @example Zero-config — works on Node, Vercel, Cloudflare Workers, Lovable
 * ```typescript
 * // src/start.ts
 * import { createStart } from "@tanstack/react-start";
 * import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";
 *
 * export const startInstance = createStart(() => ({
 *   requestMiddleware: [tanstackStartMiddleware() as never],
 * }));
 * ```
 * The SDK auto-detects the runtime and reads `FLARELOG_API_KEY` from
 * `process.env` (Node/Vercel/Workers-with-nodejs_compat) or the
 * `cloudflare:workers` `env` binding (Workers/Lovable without nodejs_compat).
 *
 * @example Eager logger — when you want custom config
 * ```typescript
 * import { flarelog } from "@flarelog/sdk";
 * const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY!, sampleRate: 0.1 });
 * // ...
 * requestMiddleware: [tanstackStartMiddleware(logger) as never],
 * ```
 *
 * @example Factory — full custom control (e.g. multi-tenant)
 * ```typescript
 * requestMiddleware: [tanstackStartMiddleware(() => createLoggerForTenant(getTenant())) as never],
 * ```
 */
export function tanstackStartMiddleware(
  loggerOrFactory?: TanstackStartLoggerInput,
): unknown {
  // Cache for the auto-logger mode. The factory is async (it probes
  // `cloudflare:workers` on the first call), so we memoize after the first
  // request. On Workers, the same isolate handles many requests, so this avoids
  // re-creating the logger (and re-reading the env) per request.
  let autoLoggerPromise: Promise<FlareLog> | null = null;

  return createMiddleware().server(async ({ next, request }) => {
    let logger: FlareLog;
    if (loggerOrFactory === undefined) {
      // Auto mode: create (and cache) the logger lazily on first request.
      if (!autoLoggerPromise) autoLoggerPromise = autoLogger();
      logger = await autoLoggerPromise;
    } else if (typeof loggerOrFactory === "function") {
      logger = await loggerOrFactory();
    } else {
      logger = loggerOrFactory;
    }

    const req = request as unknown as RequestLike;
    const traceId = resolveTraceId(req);
    const child = createChildLogger(logger, req, traceId);

    const start = Date.now();
    try {
      const result = await next({
        context: { logger: child, traceId },
      });
      const duration = Date.now() - start;
      // TanStack Start v1's `next()` returns either a raw `Response` or a
      // `RequestServerResult` shaped like `{ request, pathname, context,
      // response }`. Status lives on `result.response.status` (or
      // `result.status` if the caller returned a raw Response). Older / custom
      // setups may also return `{ status }` directly — handle all three.
      const status = readResponseStatus(result);
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
 * migration error. Use `createServerFn().middleware([tanstackStartMiddleware()])`
 * for per-server-function logging, or register `tanstackStartMiddleware()`
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
        "Use createServerFn().middleware([tanstackStartMiddleware()]) or " +
        "register tanstackStartMiddleware via createStart({ requestMiddleware: [...] }).",
    );
  };
}
