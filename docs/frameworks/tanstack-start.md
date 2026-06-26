# FlareLog SDK - TanStack Start Guide

Zero-config logging for TanStack Start applications. Automatically capture request logs, errors, and performance metrics with trace IDs.

TanStack Start does **not** expose an `app.use(...)` API. FlareLog integrates via TanStack Start's `createMiddleware()` from `@tanstack/react-start`. Register the middleware globally, per-route, or per server function.

> **Deploying to Lovable / Cloudflare Workers?** Skip to [Lazy logger on Workers / Lovable](#lazy-logger-on-workers-lovable) — the default `process.env` pattern does **not** work on those runtimes because secrets arrive as request-time bindings, not module-level env vars.

## Quick Start

### Eager logger — Node.js dev / Vercel

Use this when `process.env.FLARELOG_API_KEY` is reachable at module load.

```typescript
// src/start.ts
import { createStart } from "@tanstack/react-start";
import { flarelog } from "@flarelog/sdk";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY! });

export const startInstance = createStart(() => ({
  requestMiddleware: [tanstackStartMiddleware(logger) as never],
}));
```

### Lazy logger on Workers / Lovable

Use this when deploying to **Cloudflare Workers** (including Lovable preview
builds). On those runtimes secrets are injected as `env` bindings on the
request event, and `process.env.FLARELOG_API_KEY` is `undefined` at module
load. The SDK silently falls back to `ConsoleTransport` → nothing ships to
your dashboard.

The middleware accepts a factory function `() => FlareLog | Promise<FlareLog>`
that is invoked on every request, so it can read the per-request `env` via
`getEvent()` from `vinxi/http`:

```typescript
// src/start.ts
import { createStart } from "@tanstack/react-start";
import { flarelog, type FlareLog } from "@flarelog/sdk";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";
import { getEvent } from "vinxi/http";

let _logger: FlareLog | null = null;

function getLogger(): FlareLog {
  if (_logger) return _logger;

  // The exact shape depends on the adapter version. Log Object.keys() once
  // to confirm which path your deploy uses.
  const event = getEvent() as unknown as {
    cloudflare?: { env?: Record<string, string | undefined> };
    context?: { cloudflare?: { env?: Record<string, string | undefined> } };
  };
  const env =
    event?.cloudflare?.env ??
    event?.context?.cloudflare?.env ??
    process.env; // local dev fallback

  _logger = flarelog({
    apiKey: env.FLARELOG_API_KEY,
    environment: env.FLARELOG_ENVIRONMENT ?? "production",
    release: env.FLARELOG_RELEASE,
    workerMode: true, // critical: flushes on every event, no timer
  });
  return _logger;
}

export const startInstance = createStart(() => ({
  requestMiddleware: [tanstackStartMiddleware(getLogger) as never],
}));
```

> `tanstackStartMiddleware(logger)` returns a TanStack Start middleware built
> with `createMiddleware()`. The `as never` cast may be needed depending on
> your `createStart` type parameters; if your TS setup infers the builder type
> directly, omit it.

The `flarelog()` factory auto-detects environment, release, and serverName.
The middleware also calls `await logger.flush()` after each request to
guarantee delivery on short-lived Workers — see [Flush guarantee](#flush-guarantee)
below.

## Installation

```bash
npm install @flarelog/sdk @tanstack/react-start
```

## Middleware Setup

### Global Request Middleware

Runs before every request handled by Start — server routes, SSR, and server
functions. Define it in `src/start.ts`:

```typescript
// src/start.ts
import { createStart } from "@tanstack/react-start";
import { flarelog } from "@flarelog/sdk";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY! });

export const startInstance = createStart(() => ({
  requestMiddleware: [tanstackStartMiddleware(logger) as never],
}));
```

> If you define `src/start.ts`, also add `createCsrfMiddleware()` explicitly —
> Start only auto-installs CSRF protection when no `src/start.ts` exists.

### Per-Route Middleware

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { flarelog } from "@flarelog/sdk";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY! });

export const Route = createFileRoute("/api/users/$id")({
  server: {
    middleware: [tanstackStartMiddleware(logger) as never],
    handlers: {
      GET: async ({ context }) => {
        // context.logger is the FlareLog child logger
        context.logger.info("Fetching user");
        return new Response(JSON.stringify({ ok: true }));
      },
    },
  },
});
```

### Per Server Function Middleware

```typescript
import { createServerFn } from "@tanstack/react-start";
import { flarelog } from "@flarelog/sdk";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY! });

export const getUser = createServerFn({ method: "GET" })
  .middleware([tanstackStartMiddleware(logger) as never])
  .handler(async ({ context }) => {
    context.logger.info("getUser called");
    return { id: 1, name: "Ada" };
  });
```

### Using the Logger in Handlers

The middleware merges `logger` (a `FlareLogChild`) and `traceId` into the
downstream context. Access them directly on `context`:

```typescript
export const Route = createFileRoute("/api/orders/$id")({
  server: {
    middleware: [tanstackStartMiddleware(logger) as never],
    handlers: {
      GET: async ({ context, params }) => {
        const orderLogger = context.logger.child({ operation: "fetch-order" });
        orderLogger.info("Fetching order", { orderId: params.id });

        const order = await db.orders.find(params.id);
        if (!order) {
          orderLogger.warn("Order not found", { orderId: params.id });
          return new Response("Not Found", { status: 404 });
        }

        orderLogger.info("Order fetched", { orderId: order.id });
        return Response.json(order);
      },
    },
  },
});
```

## Flush guarantee

The middleware calls `await logger.flush()` after `next()` returns — both on
the success path and on the error path (before re-throwing).

This is necessary because TanStack Start on Cloudflare Workers / Lovable runs
inside a single Worker invocation. The Worker may be suspended the moment the
response is returned; without an explicit flush, the in-flight `fetch()` to
your OTLP/Flarelog backend gets cancelled and the log is silently dropped.

On long-lived runtimes (Node, Vercel) the extra flush is a cheap no-op because
the batch processor has already drained via its 5-second timer.

Flush errors are swallowed by the middleware (the transport already surfaces
them via `console.error` + retry/backoff). A failed flush will never crash the
request.

## What Gets Logged Automatically

### Request Completion

Every request is logged with:

- **Trace ID**: From `x-trace-id` request header or auto-generated UUID
- **Method**: HTTP method (GET, POST, etc.)
- **Path**: Request URL pathname
- **Duration**: Request duration in milliseconds
- **Status** (when available): TanStack Start exposes status setters
  (`setResponseStatus`) but not a status reader from within request
  middleware. When the `next()` result carries a numeric `status`, it is used
  for log-level mapping; otherwise completion logs at INFO.

### Log Levels by Status Code (when status is available)

| Status Range | Log Level |
|-------------|-----------|
| 2xx-3xx | INFO |
| 4xx | WARN |
| 5xx | ERROR |

### Error Capture

Unhandled errors thrown downstream are automatically captured with:

- Full error stack trace
- Request context (method, path, traceId)
- Duration at point of failure

The error is re-thrown after logging so TanStack Start's normal error handling
still runs.

## Child Loggers

Create contextual loggers for specific operations:

```typescript
context.logger.child({ source: "order-service", operation: "create-order" });
```

## Custom Trace ID Header

The middleware reads `x-trace-id`. To use a different header, wrap it with a
small custom middleware that rewrites the request first:

```typescript
import { createMiddleware } from "@tanstack/react-start";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";

const renameTraceHeader = createMiddleware().server(async ({ next, request }) => {
  const altTraceId = request.headers.get("x-request-id");
  if (altTraceId) {
    const headers = new Headers(request.headers);
    headers.set("x-trace-id", altTraceId);
    return next({ request: new Request(request, { headers }) });
  }
  return next();
});

// Apply both middlewares in order
export const startInstance = createStart(() => ({
  requestMiddleware: [renameTraceHeader, tanstackStartMiddleware(logger)],
}));
```

## Adding User Context

```typescript
export const Route = createFileRoute("/api/protected")({
  beforeLoad: async ({ context }) => {
    const user = await getUser();
    if (user) {
      context.logger.setUser({ id: user.id, email: user.email, name: user.name });
    }
    return { user };
  },
});
```

## Environment Variables

```bash
# .env (local dev / Node production)
FLARELOG_API_KEY=fl_your_api_key
FLARELOG_ENVIRONMENT=production
FLARELOG_RELEASE=1.2.3
FLARELOG_SERVER_NAME=tanstack-start
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-eu-west-0.grafana.net
OTEL_RESOURCE_ATTRIBUTES=service.name=my-app
```

> On Cloudflare Workers / Lovable, do **not** rely on `process.env`. Add the
> secrets in your platform's dashboard and read them from the request event.
> See [Lazy logger on Workers / Lovable](#lazy-logger-on-workers-lovable).

```typescript
// app.config.ts
import { flarelog } from "@flarelog/sdk";

export const logger = flarelog({
  apiKey: process.env.FLARELOG_API_KEY!,
  environment: process.env.FLARELOG_ENVIRONMENT,
  release: process.env.FLARELOG_RELEASE,
});
```

## Best Practices

1. **Always use the context logger**: Access via `context.logger` to keep trace
   context. Do not import the root logger into handlers.
2. **Log early**: Log at the start of loaders and handlers.
3. **Include IDs**: Add userId, orderId, etc. to every log.
4. **Use child loggers**: Create scoped loggers for complex operations.
5. **Set user context**: Identify authenticated users when possible.
6. **Add breadcrumbs**: Track multi-step operations.
7. **Handle errors**: Use `logError()` for structured error reporting.
8. **Use the factory pattern on Workers / Lovable**: Don't read
   `process.env.FLARELOG_API_KEY` at module load on serverless edge runtimes.
   Pass a factory that resolves the binding from the request event.

## Integration with React

Combine with the React Error Boundary for full-stack coverage:

```tsx
// app.tsx
import { FlareLogErrorBoundary } from "@flarelog/sdk/react";
import { flarelog } from "@flarelog/sdk";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY! });

export default function App() {
  return (
    <FlareLogErrorBoundary logger={logger}>
      <Router />
    </FlareLogErrorBoundary>
  );
}
```

## TypeScript Support

`@tanstack/react-start` is an optional peer dependency. When installed,
TypeScript resolves the middleware builder types against the real package.
The SDK exports a loosely-typed return from `tanstackStartMiddleware` so it
composes with `createStart`, `createFileRoute`, and `createServerFn`
middleware arrays without forcing a specific builder type.

## Migration from `withTanStackStart`

The previous `withTanStackStart(logger, handler)` wrapper was built against an
`app.use`-style API that TanStack Start does not provide. It is now a
deprecated stub that throws on invocation. Migrate to:

```typescript
createServerFn()
  .middleware([tanstackStartMiddleware(logger) as never])
  .handler(async ({ context }) => {
    context.logger.info("Processing");
    return /* ... */;
  });
```
