import type { FlareLogLike, WorkerFetchHandler, ExecutionContextLike } from "./types";
import { extractContext, injectContext, ensurePropagatorInstalled } from "./otel/propagation";

ensurePropagatorInstalled();

/**
 * Wrap a Cloudflare Worker fetch handler with automatic OTel instrumentation.
 *
 * - Extracts W3C traceparent from incoming request headers (or starts a new trace)
 * - Creates a SPAN_KIND_SERVER span with http.method, url.path, http.status_code, etc.
 * - Attaches the span as the active Context so all logs during the handler
 *   automatically carry traceId + spanId (log-to-trace correlation)
 * - Injects trace context into outgoing fetch() calls when using `logger.injectTraceContext()`
 * - Records exceptions and sets span status
 * - Flushes telemetry via ctx.waitUntil()
 */
export function createWorkerFetchHandler<T = Response>(
  logger: FlareLogLike & {
    withRequest?: <U>(
      ctx: { request: Request; traceId?: string; metadata?: Record<string, unknown> },
      executionCtx: ExecutionContextLike,
      handler: () => Promise<U>
    ) => Promise<U>;
  },
  handler: WorkerFetchHandler<T>
): WorkerFetchHandler<T> {
  // If the logger has a `withRequest` method (i.e. it's a FlareLog instance),
  // delegate to it — this gives us the full OTel span treatment.
  if (typeof logger.withRequest === "function") {
    return async (request, env, ctx) => {
      return logger.withRequest!({ request }, ctx, async () => {
        return handler(request, env, ctx);
      });
    };
  }

  // Fallback path for plain FlareLogLike loggers (no span creation, but still
  // emits start/complete logs and flushes). Used by tests and minimal loggers.
  return async (request, env, ctx) => {
    const url = new URL(request.url);
    const traceId =
      request.headers.get("traceparent")?.split("-")[1] ??
      request.headers.get("x-trace-id") ??
      crypto.randomUUID();

    const child = logger.child({
      source: "worker:fetch",
      traceId,
      method: request.method,
      path: url.pathname,
      host: url.host,
    });

    child.debug("Worker request started", { url: request.url });
    const start = Date.now();

    try {
      const result = await handler(request, env, ctx);
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

      child.info("Worker request completed", { durationMs: duration, status });

      if (typeof ctx.waitUntil === "function") {
        ctx.waitUntil(logger.flush());
      } else {
        await logger.flush();
      }
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      child.logError(err, {
        message: "Worker request failed",
        metadata: { durationMs: duration, url: request.url },
      });

      if (typeof ctx.waitUntil === "function") {
        ctx.waitUntil(logger.flush());
      } else {
        await logger.flush();
      }
      throw err;
    }
  };
}

export function wrapWorker(
  logger: FlareLogLike,
  WorkerCtor: typeof Worker
): typeof Worker {
  return class extends WorkerCtor {
    constructor(scriptURL: string | URL, options?: WorkerOptions) {
      super(scriptURL, options);

      this.addEventListener("error", (event: ErrorEvent) => {
        logger.logError(event.error ?? new Error("Worker error"), {
          message: "Worker error",
          source: "worker",
        });
      });

      this.addEventListener("messageerror", () => {
        logger.logError(new Error("Worker messageerror"), {
          message: "Worker messageerror",
          source: "worker",
        });
      });
    }
  };
}

// Re-export propagation helpers for use by framework integrations
export { extractContext, injectContext };
