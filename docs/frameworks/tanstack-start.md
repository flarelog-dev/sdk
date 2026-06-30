# FlareLog SDK - TanStack Start Guide

Zero-config logging for TanStack Start applications. Automatically capture request logs, errors, and performance metrics with trace IDs.

TanStack Start does **not** expose an `app.use(...)` API. FlareLog integrates via TanStack Start's `createMiddleware()` from `@tanstack/react-start`. Register the middleware globally, per-route, or per server function.

> **Deploying to Lovable / Cloudflare Workers?** The zero-config form below just works — the SDK auto-detects the runtime and reads secrets from `process.env` (populated per-request by `@cloudflare/vite-plugin` when `nodejs_compat` is enabled) or the `cloudflare:workers` `env` binding. See the [Lovable platform guide](/platforms/lovable) for full setup.

> **Compatibility:** Requires `@tanstack/react-start` >= 1.0.0 (stable). The integration is verified against v1.168.x.

## Installation

```bash
npm install @flarelog/sdk @tanstack/react-start
```

`@tanstack/react-start` is a peer dependency — install it if you haven't already.

## Quick Start

### Zero-config — works everywhere (recommended)

```typescript
// src/start.ts
import { createStart } from "@tanstack/react-start";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";

export const startInstance = createStart(() => ({
  requestMiddleware: [tanstackStartMiddleware() as never],
}));
```

The SDK auto-detects the runtime and reads `FLARELOG_API_KEY` from:

1. `process.env` — works on Node.js dev, Vercel, and Cloudflare Workers with
   `nodejs_compat` enabled. On TanStack Start v1 + Workers, `@cloudflare/vite-plugin`
   populates `process.env` per-request inside middleware `.server()` callbacks,
   so this is the primary path even on edge runtimes.
2. The `cloudflare:workers` `env` binding — read via `import { env } from "cloudflare:workers"`.
   The canonical Cloudflare-runtime module; works whether or not `nodejs_compat`
   is enabled. This is the fallback for Workers / **Lovable preview and production**
   when `process.env` is not populated.

It also auto-sets `workerMode: true` on Workers (so logs flush on every event
instead of waiting for a 5s timer that never fires) and calls
`logger.flush()` after each request so the Worker doesn't suspend mid-export.

#### Env resolution matrix — does it work with `.env` / Cloudflare secrets / both?

**Both.** The SDK resolves `FLARELOG_API_KEY` (and all `FLARELOG_*` /
`OTEL_*` vars) from the first source that has the key, in this exact order:

| Priority | Source | Where it works | How to set it |
|----------|--------|----------------|---------------|
| 1 (highest) | Explicit `env` arg to `autoLogger(env)` or the factory | Everywhere | Pass `c.env` (Hono), `context.env` (Pages), or your own record |
| 2 | `process.env.FLARELOG_API_KEY` | Node dev, Vercel, Cloudflare Workers **with `nodejs_compat`** | `.env` file (local), dashboard env vars (Vercel), `[vars]` in `wrangler.jsonc` (Workers) |
| 3 | `cloudflare:workers` `env` binding | Cloudflare Workers **without `nodejs_compat`**, Lovable | Cloudflare dashboard secrets, Lovable secrets panel |
| 4 (fallback) | Nothing found → console-only + `console.warn` | — | — |

**Concrete answers to common questions:**

- **"Does it work with just `.env`?"** — Yes, on Node dev / Vercel / Workers with `nodejs_compat`. Put `FLARELOG_API_KEY=fl_xxx` in `.env` and you're done.
- **"Does it work with just Cloudflare secrets?"** — Yes, on Workers (with or without `nodejs_compat`). Add `FLARELOG_API_KEY` in the Cloudflare dashboard or `wrangler secret put FLARELOG_API_KEY`. The SDK reads it via the `cloudflare:workers` `env` binding.
- **"Does it work with both?"** — Yes. Priority is: explicit arg > `process.env` > `cloudflare:workers` binding. If both are set, `process.env` wins (because it's checked first and cached).
- **"What if neither is set?"** — The SDK logs a `console.warn` once per logger instance ("No backend configured — falling back to console-only logging") and ships nothing. Silence it with `flarelog({ warnOnConsoleFallback: false })`.

This matrix is enforced by `tests/env-matrix.test.ts` — if the resolution order changes, the test fails.

> Deploying to Lovable? See the [Lovable platform guide](/platforms/lovable)
> for step-by-step setup.

### Eager logger — when you want custom config

```typescript
import { createStart } from "@tanstack/react-start";
import { flarelog } from "@flarelog/sdk";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";

const logger = flarelog({
  apiKey: process.env.FLARELOG_API_KEY!, // works on Node/Vercel; on Workers use the factory below
  sampleRate: 0.1,
});

export const startInstance = createStart(() => ({
  requestMiddleware: [tanstackStartMiddleware(logger) as never],
}));
```

### Factory — full custom control (e.g. multi-tenant, custom env source)

```typescript
import { createStart } from "@tanstack/react-start";
import { flarelog } from "@flarelog/sdk";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";
import { env } from "cloudflare:workers";

export const startInstance = createStart(() => ({
  requestMiddleware: [
    tanstackStartMiddleware(() => {
      // `env` here is the Worker binding (typed by `wrangler types` output).
      // On Node/Vercel the import throws — guard with try/catch or use
      // process.env directly there.
      return flarelog({
        apiKey: env.FLARELOG_API_KEY,
        workerMode: true,
        sampleRate: 0.1,
      });
    }) as never,
  ],
}));
```

> `tanstackStartMiddleware(logger)` returns a TanStack Start middleware built
> with `createMiddleware()`. The `as never` cast may be needed depending on
> your `createStart` type parameters; if your TS setup infers the builder type
> directly, omit it.

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
- **Status**: Read from `result.response.status` (the v1 `RequestServerResult`
  shape is `{ request, pathname, context, response }`). When `next()` returns
  a raw `Response` directly (short-circuit case), `result.status` is used
  instead. When no status can be extracted, the log defaults to INFO.

### Log Levels by Status Code

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

> On Cloudflare Workers / Lovable, do **not** rely on `process.env` at module
> load — the `env` binding is only available inside request handlers. Add the
> secrets in your platform's dashboard and use the zero-arg
> `tanstackStartMiddleware()` form (which auto-reads the `cloudflare:workers`
> `env` binding on the first request) or the factory form shown in
> [Quick Start](#factory-full-custom-control-eg-multi-tenant-custom-env-source).
> See the [Lovable platform guide](/platforms/lovable) for step-by-step setup.

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
