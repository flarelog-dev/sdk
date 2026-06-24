[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / withVercelEdge

# Function: withVercelEdge()

## Call Signature

> **withVercelEdge**(`logger`, `handler`): [`VercelEdgeHandler`](../type-aliases/VercelEdgeHandler.md)

Defined in: [frameworks/vercel.ts:193](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/frameworks/vercel.ts#L193)

Wrap a Vercel Edge Function or Edge Middleware handler with automatic OTel
instrumentation.

For `FlareLog` instances (which have `withRequest`), this delegates to the
full OTel span treatment — extracting W3C `traceparent`, creating a
`SPAN_KIND_SERVER` span, and flushing telemetry.

For plain `FlareLogLike` loggers (e.g. in tests), it falls back to a lighter
touch: creates a child logger with request context and emits start/complete
logs.

### Parameters

#### logger

[`FlareLog`](../classes/FlareLog.md)

#### handler

[`VercelEdgeHandler`](../type-aliases/VercelEdgeHandler.md)

### Returns

[`VercelEdgeHandler`](../type-aliases/VercelEdgeHandler.md)

### Examples

**Edge Function**

```typescript
// api/edge-hello.ts
import { flarelog } from "@flarelog/sdk";
import { withVercelEdge } from "@flarelog/sdk/vercel";

export const config = { runtime: "edge" };

const logger = flarelog({});

export default withVercelEdge(logger, async (request) => {
  return new Response("Hello from the edge!", { status: 200 });
});
```

**Edge Middleware**

```typescript
// middleware.ts
import { flarelog } from "@flarelog/sdk";
import { withVercelEdge } from "@flarelog/sdk/vercel";

const logger = flarelog({});

export default withVercelEdge(logger, async (request) => {
  const url = new URL(request.url);
  logger.info("Middleware executed", { path: url.pathname });
  return NextResponse.next();
});
```

## Call Signature

> **withVercelEdge**(`logger`, `handler`): [`VercelEdgeHandler`](../type-aliases/VercelEdgeHandler.md)

Defined in: [frameworks/vercel.ts:197](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/frameworks/vercel.ts#L197)

Wrap a Vercel Edge Function or Edge Middleware handler with automatic OTel
instrumentation.

For `FlareLog` instances (which have `withRequest`), this delegates to the
full OTel span treatment — extracting W3C `traceparent`, creating a
`SPAN_KIND_SERVER` span, and flushing telemetry.

For plain `FlareLogLike` loggers (e.g. in tests), it falls back to a lighter
touch: creates a child logger with request context and emits start/complete
logs.

### Parameters

#### logger

[`FlareLogLike`](../interfaces/FlareLogLike.md)

#### handler

[`VercelEdgeHandler`](../type-aliases/VercelEdgeHandler.md)

### Returns

[`VercelEdgeHandler`](../type-aliases/VercelEdgeHandler.md)

### Examples

**Edge Function**

```typescript
// api/edge-hello.ts
import { flarelog } from "@flarelog/sdk";
import { withVercelEdge } from "@flarelog/sdk/vercel";

export const config = { runtime: "edge" };

const logger = flarelog({});

export default withVercelEdge(logger, async (request) => {
  return new Response("Hello from the edge!", { status: 200 });
});
```

**Edge Middleware**

```typescript
// middleware.ts
import { flarelog } from "@flarelog/sdk";
import { withVercelEdge } from "@flarelog/sdk/vercel";

const logger = flarelog({});

export default withVercelEdge(logger, async (request) => {
  const url = new URL(request.url);
  logger.info("Middleware executed", { path: url.pathname });
  return NextResponse.next();
});
```
