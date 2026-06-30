# Trace Propagation

FlareLog supports W3C trace context propagation for distributed tracing across services.

## W3C Trace Context

The W3C `traceparent` header format:

```
traceparent: 00-<trace-id>-<span-id>-<flags>
```

Example:
```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

## Automatic Extraction

FlareLog automatically extracts W3C trace context from incoming requests:

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

export default {
  fetch: workerFetch(
    // Create the logger INSIDE the handler — `env` is not available at module
    // scope on Workers.
    flarelog(),
    async (request, env, ctx) => {
      // If request has traceparent header, logs are automatically correlated
      // The logger from workerFetch's scope inherits the traceId from the header
      return new Response("OK");
    },
  ),
};
```

## Injecting Trace Context

Propagate trace context to outgoing requests:

```typescript
const headers = new Headers();
logger.injectTraceContext(headers);
const data = await fetch("https://api.example.com/orders", { headers });
// The downstream service will receive the traceparent header
```

## Manual Trace Context

For advanced use cases:

```typescript
import { extractContext, injectContext } from "@flarelog/sdk";

// Extract from incoming headers
const context = extractContext(request.headers);

// Inject into outgoing headers
const outgoingHeaders = new Headers();
injectContext(outgoingHeaders, context);
```

## Active Span Context

Get the current trace context:

```typescript
import { getActiveSpanContext } from "@flarelog/sdk";

const spanContext = getActiveSpanContext();
if (spanContext) {
  console.log("Trace ID:", spanContext.traceId);
  console.log("Span ID:", spanContext.spanId);
}
```

## With Active Span

Create a manual span for business logic:

```typescript
import { withActiveSpan } from "@flarelog/sdk";

await withActiveSpan("process-payment", async (span) => {
  span.setAttribute("payment.order_id", orderId);
  const result = await charge(orderId);
  span.setAttribute("payment.amount", result.amount);
  return result;
});
```

## Framework Integration

### Next.js

```typescript
// Middleware automatically propagates trace context
export default withNextMiddleware(logger, async (request) => {
  // Trace context is extracted from incoming requests
  // and injected into outgoing fetch() calls automatically
  const data = await fetch("https://api.example.com/data");
  return NextResponse.json(data);
});
```

### Cloudflare Workers

```typescript
// Service bindings (worker-to-worker)
export default {
  fetch: workerFetch(logger, async (request, env, ctx) => {
    const backendRequest = new Request(request);
    logger.injectTraceContext(backendRequest.headers);
    
    const response = await env.BACKEND_WORKER.fetch(backendRequest);
    return response;
  }),
};
```
