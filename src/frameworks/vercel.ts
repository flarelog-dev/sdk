import type { FlareLog } from "../client";
import type { FlareLogLike, ExecutionContextLike } from "../types";

// ---------------------------------------------------------------------------
// Inline types — avoids a hard dependency on @vercel/node or next
// ---------------------------------------------------------------------------

/**
 * Shape of a Vercel Serverless Function request (Node.js runtime).
 * Mirrors `VercelRequest` from `@vercel/node` without importing it.
 */
interface VercelRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[]>;
  body?: unknown;
  cookies?: Record<string, string>;
}

/**
 * Shape of a Vercel Serverless Function response (Node.js runtime).
 * Mirrors `VercelResponse` from `@vercel/node` without importing it.
 */
interface VercelResponse {
  statusCode: number;
  status(code: number): VercelResponse;
  json(data: unknown): VercelResponse;
  send(data?: unknown): VercelResponse;
  end(): VercelResponse;
  setHeader(name: string, value: string | string[]): VercelResponse;
  getHeader(name: string): string | string[] | undefined;
  headersSent: boolean;
  on(event: string, callback: () => void): void;
}

/**
 * Handler signature for Vercel Serverless Functions (Node.js runtime).
 */
export type VercelServerlessHandler = (
  req: VercelRequest & { logger: FlareLogLike; traceId: string },
  res: VercelResponse
) => void | Promise<void>;

/**
 * Handler signature for Vercel Edge Functions and Edge Middleware.
 * Uses the standard Web API `Request` / `Response` objects.
 */
export type VercelEdgeHandler = (
  request: Request
) => Response | Promise<Response>;

// ---------------------------------------------------------------------------
// Vercel Serverless Function wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap a Vercel Serverless Function handler with automatic logging and tracing.
 *
 * What it does:
 * - Extracts or generates a `traceId` from incoming request headers
 * - Creates a child logger with request context (method, path, traceId)
 * - Attaches the child logger and traceId to `req` for downstream use
 * - Logs request completion with duration and status code
 * - Captures and logs unhandled errors before re-throwing
 * - Uses `res.on("finish")` to reliably capture the final status code
 *
 * @example Basic usage
 * ```typescript
 * // api/hello.ts
 * import { flarelog } from "@flarelog/sdk";
 * import { withVercelServerless } from "@flarelog/sdk/vercel";
 *
 * const logger = flarelog({});
 *
 * export default withVercelServerless(logger, async (req, res) => {
 *   req.logger.info("Processing request");
 *   res.json({ message: "Hello from Vercel!" });
 * });
 * ```
 *
 * @example With Flarelog API key
 * ```typescript
 * // Set FLARELOG_API_KEY in Vercel project environment variables
 * const logger = flarelog({});
 * // → ships logs to your flarelog.dev dashboard
 * ```
 */
export function withVercelServerless(
  logger: FlareLog,
  handler: VercelServerlessHandler
): VercelServerlessHandler {
  return (req, res) => {
    const traceId =
      (req.headers["x-trace-id"] as string) ||
      (req.headers["traceparent"] as string)?.split("-")[1] ||
      crypto.randomUUID();

    const child = logger.child({
      source: "vercel:serverless",
      traceId,
      method: req.method,
      path: req.url,
    });

    // Attach logger and traceId to the request for downstream use
    (req as VercelRequest & { logger: FlareLogLike; traceId: string }).logger = child;
    (req as VercelRequest & { logger: FlareLogLike; traceId: string }).traceId = traceId;

    const start = Date.now();

    // Listen for the response "finish" event to capture the final status code
    res.on("finish", () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const level =
        status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO";

      child.log(level, "Vercel Serverless request completed", {
        status,
        durationMs: duration,
      });
    });

    const typedReq = req as VercelRequest & { logger: FlareLogLike; traceId: string };

    // Wrap the handler to capture errors
    return Promise.resolve()
      .then(() => handler(typedReq, res))
      .catch((err) => {
        const duration = Date.now() - start;
        child.logError(err, {
          message: "Vercel Serverless request failed",
          metadata: { durationMs: duration, url: req.url, method: req.method },
        });
        // Ensure a 500 is sent if headers haven't been sent yet
        if (!res.headersSent) {
          res.statusCode = 500;
          res.json({ error: "Internal Server Error" });
        }
        throw err;
      })
      .finally(() => logger.flush());
  };
}

// ---------------------------------------------------------------------------
// Vercel Edge Function / Edge Middleware wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap a Vercel Edge Function or Edge Middleware handler with automatic OTel
 * instrumentation.
 *
 * For `FlareLog` instances (which have `withRequest`), this delegates to the
 * full OTel span treatment — extracting W3C `traceparent`, creating a
 * `SPAN_KIND_SERVER` span, and flushing telemetry.
 *
 * For plain `FlareLogLike` loggers (e.g. in tests), it falls back to a lighter
 * touch: creates a child logger with request context and emits start/complete
 * logs.
 *
 * @example Edge Function
 * ```typescript
 * // api/edge-hello.ts
 * import { flarelog } from "@flarelog/sdk";
 * import { withVercelEdge } from "@flarelog/sdk/vercel";
 *
 * export const config = { runtime: "edge" };
 *
 * const logger = flarelog({});
 *
 * export default withVercelEdge(logger, async (request) => {
 *   return new Response("Hello from the edge!", { status: 200 });
 * });
 * ```
 *
 * @example Edge Middleware
 * ```typescript
 * // middleware.ts
 * import { flarelog } from "@flarelog/sdk";
 * import { withVercelEdge } from "@flarelog/sdk/vercel";
 *
 * const logger = flarelog({});
 *
 * export default withVercelEdge(logger, async (request) => {
 *   const url = new URL(request.url);
 *   logger.info("Middleware executed", { path: url.pathname });
 *   return NextResponse.next();
 * });
 * ```
 */
export function withVercelEdge(
  logger: FlareLog,
  handler: VercelEdgeHandler
): VercelEdgeHandler;
export function withVercelEdge(
  logger: FlareLogLike,
  handler: VercelEdgeHandler
): VercelEdgeHandler;
export function withVercelEdge(
  logger: FlareLog | FlareLogLike,
  handler: VercelEdgeHandler
): VercelEdgeHandler {
  // Full OTel path — only FlareLog instances have `withRequest`
  if (
    typeof (logger as FlareLog).withRequest === "function"
  ) {
    const fl = logger as FlareLog;
    return (request: Request) => {
      // Edge Functions don't have a waitUntil-style execution context,
      // so we pass a stub. withRequest will fall back to blocking flush.
      const executionCtx: ExecutionContextLike = {};
      return fl.withRequest(
        { request },
        executionCtx,
        async () => handler(request)
      );
    };
  }

  // Fallback path for plain FlareLogLike loggers
  return async (request: Request) => {
    const url = new URL(request.url);
    const traceId =
      request.headers.get("traceparent")?.split("-")[1] ||
      request.headers.get("x-trace-id") ||
      crypto.randomUUID();

    const child = logger.child({
      source: "vercel:edge",
      traceId,
      method: request.method,
      path: url.pathname,
      host: url.host,
    });

    child.debug("Vercel Edge request started", { url: request.url });
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

      const level =
        status !== undefined && status >= 500
          ? "ERROR"
          : status !== undefined && status >= 400
            ? "WARN"
            : "INFO";

      child.log(level, "Vercel Edge request completed", {
        status,
        durationMs: duration,
      });

      await logger.flush();
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      child.logError(err, {
        message: "Vercel Edge request failed",
        metadata: { durationMs: duration, url: request.url },
      });
      await logger.flush();
      throw err;
    }
  };
}

// ---------------------------------------------------------------------------
// Vercel environment detection helper
// ---------------------------------------------------------------------------

/**
 * Detect Vercel-specific environment information.
 *
 * Reads the standard `VERCEL_*` environment variables set automatically by
 * the Vercel platform and returns them as a structured object. Returns `null`
 * when not running on Vercel.
 *
 * This is useful for enriching log metadata with deployment context:
 * - `VERCEL` — always `"1"` on Vercel
 * - `VERCEL_ENV` — `"production"` | `"preview"` | `"development"`
 * - `VERCEL_REGION` — deployment region (e.g. `"iad1"`)
 * - `VERCEL_URL` — auto-generated deployment URL
 * - `VERCEL_GIT_COMMIT_SHA` — git commit SHA
 * - `VERCEL_GIT_COMMIT_REF` — git branch name
 * - `VERCEL_PROJECT_ID` — Vercel project identifier
 * - `VERCEL_DEPLOYMENT_ID` — unique deployment identifier
 */
export function detectVercelEnv(): {
  isVercel: true;
  environment: string;
  region: string;
  url: string;
  commitSha: string;
  commitRef: string;
  projectId: string;
  deploymentId: string;
} | null {
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    if (!proc?.env || proc.env["VERCEL"] !== "1") {
      return null;
    }

    const env = proc.env;
    return {
      isVercel: true,
      environment: env["VERCEL_ENV"] ?? "development",
      region: env["VERCEL_REGION"] ?? "",
      url: env["VERCEL_URL"] ?? "",
      commitSha: env["VERCEL_GIT_COMMIT_SHA"] ?? "",
      commitRef: env["VERCEL_GIT_COMMIT_REF"] ?? "",
      projectId: env["VERCEL_PROJECT_ID"] ?? "",
      deploymentId: env["VERCEL_DEPLOYMENT_ID"] ?? "",
    };
  } catch {
    return null;
  }
}
