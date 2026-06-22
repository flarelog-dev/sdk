import type { FlareLog } from "../client";
import type { WorkerFetchHandler } from "../types";

/**
 * Wrap a Cloudflare Worker fetch handler with automatic OTel instrumentation.
 *
 * v2 — emits an OTel SERVER span for every request:
 * - Extracts W3C `traceparent` from incoming headers (or starts a new trace)
 * - Creates a SPAN_KIND_SERVER span: `GET /api/users`
 * - Sets http.request.method, url.path, url.full, http.response.status_code, etc.
 * - All logs emitted inside the handler carry the span's traceId + spanId
 * - Records exceptions on the span and sets span status
 * - Flushes telemetry via ctx.waitUntil() (with blocking fallback for tests)
 *
 * @example
 * ```typescript
 * import { flarelog, workerFetch } from "@flarelog/sdk";
 *
 * // No API key needed — defaults to console output
 * const logger = flarelog({});
 *
 * export default {
 *   fetch: workerFetch(logger, async (request, env, ctx) => {
 *     return new Response("Hello");
 *   }),
 * };
 * ```
 *
 * @example Fan-out to Flarelog + Grafana
 * ```typescript
 * // wrangler.toml:
 * //   FLARELOG_API_KEY = "fl_your_key"
 * //   OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp-gateway-prod-eu-west-0.grafana.net"
 * //   OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Basic <base64>"
 * const logger = flarelog({});
 * // → ships to both Flarelog dashboard and Grafana Cloud, plus console
 * ```
 */
export function workerFetch<T = Response>(
  logger: FlareLog,
  handler: WorkerFetchHandler<T>
): WorkerFetchHandler<T> {
  return async (request, env, ctx) => {
    return logger.withRequest(
      { request },
      ctx,
      async () => handler(request, env, ctx)
    );
  };
}
