[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / pagesFunction

# Function: pagesFunction()

> **pagesFunction**\<`T`\>(`logger`, `handler`): [`PagesFunctionHandler`](../type-aliases/PagesFunctionHandler.md)\<`T`\>

Defined in: [frameworks/cf-workers.ts:113](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/frameworks/cf-workers.ts#L113)

Wrap a Cloudflare Pages Function handler with automatic OTel instrumentation.

Pages Functions run on the Workers runtime but use a different API shape:
- Receives a single `context` object with `request`, `env`, `waitUntil`, etc.
- Extracts W3C `traceparent` from incoming headers (or starts a new trace)
- Creates a SPAN_KIND_SERVER span: `GET /api/users`
- Sets http.request.method, url.path, url.full, http.response.status_code, etc.
- All logs emitted inside the handler carry the span's traceId + spanId
- Records exceptions on the span and sets span status
- Flushes telemetry via context.waitUntil() (with blocking fallback for tests)

Honors the same `OPTIONS`/`HEAD` and `ignorePaths` bypass as
[workerFetch](workerFetch.md) — see [FlareLogConfig.ignorePaths](../interfaces/FlareLogConfig.md#ignorepaths) for details.

## Type Parameters

### T

`T` = `Response`

## Parameters

### logger

[`FlareLog`](../classes/FlareLog.md)

### handler

[`PagesFunctionHandler`](../type-aliases/PagesFunctionHandler.md)\<`T`\>

## Returns

[`PagesFunctionHandler`](../type-aliases/PagesFunctionHandler.md)\<`T`\>

## Examples

```typescript
// functions/api/hello.ts
import { flarelog, pagesFunction } from "@flarelog/sdk";

const logger = flarelog({ apiKey: "fl_your_key" });

export const onRequest = pagesFunction(logger, async (context) => {
  logger.info("Hello from Pages", { url: context.request.url });
  return new Response("Hello from Pages Functions!");
});
```

**With middleware**

```typescript
// functions/_middleware.ts
import { flarelog, pagesFunction } from "@flarelog/sdk";

const logger = flarelog({});

export const onRequest = pagesFunction(logger, async (context) => {
  logger.info("Middleware running");
  return context.next();
});
```
