[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / createWorkerFetchHandler

# Function: createWorkerFetchHandler()

> **createWorkerFetchHandler**\<`T`\>(`logger`, `handler`): [`WorkerFetchHandler`](../type-aliases/WorkerFetchHandler.md)\<`T`\>

Defined in: [workers.ts:15](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/workers.ts#L15)

Wrap a Cloudflare Worker fetch handler with automatic OTel instrumentation.

- Extracts W3C traceparent from incoming request headers (or starts a new trace)
- Creates a SPAN_KIND_SERVER span with http.method, url.path, http.status_code, etc.
- Attaches the span as the active Context so all logs during the handler
  automatically carry traceId + spanId (log-to-trace correlation)
- Injects trace context into outgoing fetch() calls when using `logger.injectTraceContext()`
- Records exceptions and sets span status
- Flushes telemetry via ctx.waitUntil()

## Type Parameters

### T

`T` = `Response`

## Parameters

### logger

[`FlareLogLike`](../interfaces/FlareLogLike.md) & `object`

### handler

[`WorkerFetchHandler`](../type-aliases/WorkerFetchHandler.md)\<`T`\>

## Returns

[`WorkerFetchHandler`](../type-aliases/WorkerFetchHandler.md)\<`T`\>
