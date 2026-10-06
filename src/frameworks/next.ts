import type { FlareLog } from "../client";
import type { ExecutionContextLike, FlareLogLike } from "../types";

// ---------------------------------------------------------------------------
// Inline types — avoids a hard dependency on `next`
// ---------------------------------------------------------------------------

/**
 * Minimal shape of a Next.js Pages Router `NextApiRequest`.
 * We inline it so `@flarelog/sdk/next` remains zero-dependency.
 */
interface NextApiRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[]>;
  body?: unknown;
}

/**
 * Minimal shape of a Next.js Pages Router `NextApiResponse`.
 * Mirrors the real response object closely enough for logging.
 */
interface NextApiResponse {
  statusCode: number;
  headersSent: boolean;
  status(code: number): NextApiResponse;
  json(data: unknown): NextApiResponse;
  send(data?: unknown): NextApiResponse;
  end(): NextApiResponse;
  setHeader(name: string, value: string | string[] | number): NextApiResponse;
  getHeader(name: string): string | number | string[] | undefined;
  on(event: "finish" | "close", callback: () => void): void;
}

/**
 * Shared Web API handler shape used by App Router Route Handlers and
 * Next.js Edge Middleware.
 */
type NextWebHandler = (request: Request) => Response | Promise<Response>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTraceId(
  headers: Headers | Record<string, string | string[] | undefined>
): string {
  if (headers instanceof Headers) {
    return (
      headers.get("traceparent")?.split("-")[1] ||
      headers.get("x-trace-id") ||
      crypto.randomUUID()
    );
  }

  const rawTraceId = headers["x-trace-id"];
  const rawTraceparent = headers["traceparent"];
  const traceId = Array.isArray(rawTraceId) ? rawTraceId[0] : rawTraceId;
  const traceparent = Array.isArray(rawTraceparent) ? rawTraceparent[0] : rawTraceparent;
  return traceparent?.split("-")[1] || traceId || crypto.randomUUID();
}

function logLevelForStatus(status: number | undefined): "ERROR" | "WARN" | "INFO" {
  if (status === undefined) return "INFO";
  if (status >= 500) return "ERROR";
  if (status >= 400) return "WARN";
  return "INFO";
}

// ---------------------------------------------------------------------------
// Pages Router API route wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap a Next.js Pages Router API route with automatic logging.
 *
 * - Extracts or generates a `traceId` from `x-trace-id` or W3C `traceparent`
 * - Creates a child logger with request context (method, path, traceId)
 * - Attaches `req.logger` and `req.traceId` for downstream use
 * - Uses `res.on("finish")` to reliably capture the final status code
 * - Maps status codes to log levels (5xx→ERROR, 4xx→WARN, else INFO)
 * - Captures and logs unhandled errors; sends 500 if headers not sent yet
 * - Flushes logger telemetry before the invocation ends
 *
 * @example
 * ```typescript
 * // pages/api/hello.ts
 * import { flarelog } from "@flarelog/sdk";
 * import { withFlareLog } from "@flarelog/sdk/next";
 *
 * const logger = flarelog({});
 *
 * export default withFlareLog(logger, async (req, res) => {
 *   req.logger.info("Processing request");
 *   res.json({ message: "Hello from Next.js!" });
 * });
 * ```
 */
export function withFlareLog<T>(
  logger: FlareLog,
  handler: (
    req: NextApiRequest & { logger: FlareLogLike; traceId: string },
    res: NextApiResponse
  ) => T | Promise<T>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const traceId = extractTraceId(req.headers);
    const child = logger.child({
      source: "nextjs",
      traceId,
      method: req.method,
      path: req.url,
    });

    (req as NextApiRequest & { logger: FlareLogLike; traceId: string }).logger = child;
    (req as NextApiRequest & { logger: FlareLogLike; traceId: string }).traceId = traceId;

    const start = Date.now();

    // Wait for the response to finish so we log the real status code.
    res.on("finish", () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      child.log(
        logLevelForStatus(status),
        "Next.js API request completed",
        { status, durationMs: duration },
        { traceId }
      );
    });

    try {
      return await handler(
        req as NextApiRequest & { logger: FlareLogLike; traceId: string },
        res
      );
    } catch (err) {
      const duration = Date.now() - start;
      child.logError(err, {
        message: "Next.js API request failed",
        metadata: { durationMs: duration, url: req.url, method: req.method },
        traceId,
      });
      // Ensure a 500 is sent if headers haven't been sent yet
      if (!res.headersSent) {
        res.statusCode = 500;
        res.json({ error: "Internal Server Error" });
      }
      throw err;
    } finally {
      await logger.flush();
    }
  };
}

// ---------------------------------------------------------------------------
// App Router / Edge shared fallback logger
// ---------------------------------------------------------------------------

function createWebFallbackHandler(
  logger: FlareLogLike,
  handler: NextWebHandler,
  source: string
): NextWebHandler {
  return async (request: Request) => {
    const url = new URL(request.url);
    const traceId = extractTraceId(request.headers);
    const child = logger.child({
      source,
      traceId,
      method: request.method,
      path: url.pathname,
      host: url.host,
    });

    child.debug(`${source} request started`, { url: request.url });
    const start = Date.now();

    try {
      const result = await handler(request);
      const duration = Date.now() - start;

      let status: number | undefined;
      if (
        result &&
        typeof result === "object" &&
        "status" in result &&
        typeof (result as { status: unknown }).status === "number"
      ) {
        status = (result as { status: number }).status;
      }

      child.log(
        logLevelForStatus(status),
        `${source} request completed`,
        { status, durationMs: duration },
        { traceId }
      );

      await logger.flush();
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      child.logError(err, {
        message: `${source} request failed`,
        metadata: { durationMs: duration, url: request.url },
        traceId,
      });
      await logger.flush();
      throw err;
    }
  };
}

// ---------------------------------------------------------------------------
// App Router Route Handler wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap a Next.js App Router Route Handler (`app/api/[name]/route.ts`) with
 * automatic OTel instrumentation.
 *
 * For `FlareLog` instances this emits a full W3C SERVER span via
 * `logger.withRequest`, which propagates trace context and flushes telemetry.
 * For plain loggers it falls back to lightweight request logging.
 *
 * @example
 * ```typescript
 * // app/api/hello/route.ts
 * import { flarelog } from "@flarelog/sdk";
 * import { withNextRouteHandler } from "@flarelog/sdk/next";
 *
 * const logger = flarelog({});
 *
 * export const GET = withNextRouteHandler(logger, async (request) => {
 *   return Response.json({ message: "Hello from App Router!" });
 * });
 * ```
 */
export function withNextRouteHandler(
  logger: FlareLog,
  handler: NextWebHandler
): NextWebHandler;
export function withNextRouteHandler(
  logger: FlareLogLike,
  handler: NextWebHandler
): NextWebHandler;
export function withNextRouteHandler(
  logger: FlareLog | FlareLogLike,
  handler: NextWebHandler
): NextWebHandler {
  if (typeof (logger as FlareLog).withRequest === "function") {
    const fl = logger as FlareLog;
    return (request: Request) => {
      const executionCtx: ExecutionContextLike = {};
      return fl.withRequest(
        { request },
        executionCtx,
        async () => handler(request)
      );
    };
  }

  return createWebFallbackHandler(logger, handler, "nextjs:app-router");
}

// ---------------------------------------------------------------------------
// Next.js Edge Middleware wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap a Next.js Edge Middleware (`middleware.ts`) handler with automatic
 * OTel instrumentation.
 *
 * The wrapped handler must return a `Response` — typically the result of
 * `NextResponse.next()` or `NextResponse.rewrite()`.
 *
 * @example
 * ```typescript
 * // middleware.ts
 * import { NextResponse } from "next/server";
 * import { flarelog } from "@flarelog/sdk";
 * import { withNextMiddleware } from "@flarelog/sdk/next";
 *
 * const logger = flarelog({});
 *
 * export default withNextMiddleware(logger, async (request) => {
 *   logger.info("Middleware executed", { path: new URL(request.url).pathname });
 *   return NextResponse.next();
 * });
 * ```
 */
export function withNextMiddleware(
  logger: FlareLog,
  handler: NextWebHandler
): NextWebHandler;
export function withNextMiddleware(
  logger: FlareLogLike,
  handler: NextWebHandler
): NextWebHandler;
export function withNextMiddleware(
  logger: FlareLog | FlareLogLike,
  handler: NextWebHandler
): NextWebHandler {
  if (typeof (logger as FlareLog).withRequest === "function") {
    const fl = logger as FlareLog;
    return (request: Request) => {
      const executionCtx: ExecutionContextLike = {};
      return fl.withRequest(
        { request },
        executionCtx,
        async () => handler(request)
      );
    };
  }

  return createWebFallbackHandler(logger, handler, "nextjs:middleware");
}

// ---------------------------------------------------------------------------
// instrumentation.ts — onRequestError
// ---------------------------------------------------------------------------

/**
 * The `request` argument Next.js passes to `onRequestError`.
 * Inlined so `@flarelog/sdk/next` stays free of a hard `next` dependency.
 */
export interface NextRequestErrorRequest {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

/** The `context` argument Next.js passes to `onRequestError`. */
export interface NextRequestErrorContext {
  routerKind: "Pages Router" | "App Router";
  routePath: string;
  routeType: "render" | "route" | "action" | "middleware";
  renderSource?:
    | "react-server-components"
    | "react-server-components-payload"
    | "server-rendering";
  revalidateReason?: "on-demand" | "stale" | undefined;
  renderType?: "dynamic" | "dynamic-resume";
}

/**
 * Build an `onRequestError` hook for Next.js's `instrumentation.ts` that sends
 * every uncaught server-side error to FlareLog.
 *
 * In production Next.js hides the real error from the browser and shows
 * "Application error: a server-side exception has occurred" with a `Digest`.
 * The digest is a hash that appears next to the real stack trace in the server
 * logs; this hook records the digest together with the error, so you can paste
 * the digest from the error page into FlareLog and land on the exact failure.
 *
 * Works on any host (Vercel, Docker, a VPS, ...), because it runs inside the
 * Next.js server rather than depending on the platform's log viewer.
 *
 * @example
 * ```ts
 * // instrumentation.ts
 * import { flarelog } from "@flarelog/sdk";
 * import { createOnRequestError } from "@flarelog/sdk/next";
 *
 * const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });
 * export const onRequestError = createOnRequestError(logger);
 * ```
 */
export function createOnRequestError(
  logger: Pick<FlareLogLike, "error"> & { flush?: () => Promise<void> }
): (
  error: unknown,
  request: NextRequestErrorRequest,
  context: NextRequestErrorContext
) => Promise<void> {
  return async (error, request, context) => {
    try {
      const err = error instanceof Error ? error : new Error(String(error));
      const digest = (error as { digest?: unknown } | null)?.digest;

      // Path only: query strings routinely carry tokens and other secrets.
      const path = (request?.path ?? "").split("?")[0];

      logger.error(err.message || err.name, {
        "next.digest": typeof digest === "string" ? digest : undefined,
        "next.route": context?.routePath,
        "next.route_type": context?.routeType,
        "next.router_kind": context?.routerKind,
        "next.render_source": context?.renderSource,
        "http.method": request?.method,
        "http.path": path,
        "error.type": err.name,
        "error.stack": err.stack,
        "next.hook": "onRequestError",
      });

      // The invocation may be frozen as soon as this hook returns.
      await logger.flush?.();
    } catch {
      // Never let telemetry throw inside Next.js's error path.
    }
  };
}
