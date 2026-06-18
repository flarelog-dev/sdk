import type { FlareLog } from "../client";
import type { WorkerFetchHandler } from "../types";

/**
 * Wrap a Cloudflare Worker fetch handler with automatic logging.
 * 
 * - Auto-creates request context with traceId
 * - Logs request start/completion with duration
 * - Captures errors automatically
 * - Flushes logs via ctx.waitUntil()
 * 
 * @example
 * ```typescript
 * import { flarelog, workerFetch } from "@flarelog/sdk";
 * 
 * const logger = flarelog({ apiKey: env.FLARELOG_API_KEY, });
 * 
 * export default {
 *   fetch: workerFetch(logger, async (request, env, ctx) => {
 *     return new Response("Hello");
 *   }),
 * };
 * ```
 */
export function workerFetch<T = Response>(
  logger: FlareLog,
  handler: WorkerFetchHandler<T>
): WorkerFetchHandler<T> {
  return async (request, env, ctx) => {
    const traceId =
      request.headers.get("x-trace-id") ??
      request.headers.get("x-request-id") ??
      crypto.randomUUID();

    const child = logger.child({
      source: "worker:fetch",
      traceId,
      method: request.method,
      path: new URL(request.url).pathname,
      host: new URL(request.url).host,
    });

    child.debug("Request started", { url: request.url });
    const start = Date.now();

    try {
      const result = await handler(request, env, ctx);
      const duration = Date.now() - start;
      
      const status = result instanceof Response ? result.status : undefined;
      
      child.info("Request completed", {
        durationMs: duration,
        status,
      });

      if (typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(logger.flush());
      } else {
        await logger.flush();
      }
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      child.logError(err, {
        message: "Request failed",
        metadata: { durationMs: duration, url: request.url },
      });

      if (typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(logger.flush());
      } else {
        await logger.flush();
      }
      throw err;
    }
  };
}
