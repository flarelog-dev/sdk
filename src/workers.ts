import type { FlareLogLike, WorkerFetchHandler } from "./types";

export function createWorkerFetchHandler<T = Response>(
  logger: FlareLogLike,
  handler: WorkerFetchHandler<T>
): WorkerFetchHandler<T> {
  return async (request, env, ctx) => {
    const url = new URL(request.url);
    const traceId =
      request.headers.get("x-trace-id") ??
      request.headers.get("x-request-id") ??
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

      child.info("Worker request completed", {
        durationMs: duration,
        status,
      });

      // Opportunistic flush: logs accumulated during the handler are batched
      // Final guarantee via ctx.waitUntil (or blocking fallback)
      if (typeof ctx.waitUntil === 'function') {
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

      // Opportunistic flush: logs accumulated during the handler are batched
      // Final guarantee via ctx.waitUntil (or blocking fallback)
      if (typeof ctx.waitUntil === 'function') {
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
