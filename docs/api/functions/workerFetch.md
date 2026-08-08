[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / workerFetch

# Function: workerFetch()

> **workerFetch**\<`T`\>(`logger`, `handler`): [`WorkerFetchHandler`](../type-aliases/WorkerFetchHandler.md)\<`T`\>

Defined in: [frameworks/cf-workers.ts:59](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/frameworks/cf-workers.ts#L59)

Wrap a Cloudflare Worker fetch handler with automatic OTel instrumentation.

v2 — emits an OTel SERVER span for every request:
- Extracts W3C `traceparent` from incoming headers (or starts a new trace)
- Creates a SPAN_KIND_SERVER span: `GET /api/users`
- Sets http.request.method, url.path, url.full, http.response.status_code, etc.
- All logs emitted inside the handler carry the span's traceId + spanId
- Records exceptions on the span and sets span status
- Flushes telemetry via ctx.waitUntil() (with blocking fallback for tests)

Bypass: requests whose method is `OPTIONS` or `HEAD`, or whose URL pathname
matches any entry in the logger's `ignorePaths` config, skip instrumentation
entirely (no span, no flush). This keeps CORS preflight traffic and
browser-driven noise like `/favicon.ico` out of your dashboard without
requiring changes to your handler. See [FlareLogConfig.ignorePaths](../interfaces/FlareLogConfig.md#ignorepaths).

## Type Parameters

### T

`T` = `Response`

## Parameters

### logger

[`FlareLog`](../classes/FlareLog.md)

### handler

[`WorkerFetchHandler`](../type-aliases/WorkerFetchHandler.md)\<`T`\>

## Returns

[`WorkerFetchHandler`](../type-aliases/WorkerFetchHandler.md)\<`T`\>

## Examples

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

// No API key needed — defaults to console output
const logger = flarelog({});

export default {
  fetch: workerFetch(logger, async (request, env, ctx) => {
    return new Response("Hello");
  }),
};
```

**Fan-out to Flarelog + Grafana**

```typescript
// wrangler.toml:
//   FLARELOG_API_KEY = "fl_your_key"
//   OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp-gateway-prod-eu-west-0.grafana.net"
//   OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Basic <base64>"
const logger = flarelog({});
// → ships to both Flarelog dashboard and Grafana Cloud, plus console
```

**Skip favicon and static assets**

```typescript
const logger = flarelog({
  apiKey: env.FLARELOG_API_KEY,
  ignorePaths: ["/favicon.ico", "/robots.txt", /^/static//],
});

export default {
  fetch: workerFetch(logger, async (request, env, ctx) => {
    return new Response("Hello");
  }),
};
```
