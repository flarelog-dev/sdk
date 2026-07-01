# FlareLog SDK - Hono Guide

Zero-config logging for [Hono](https://hono.dev) applications. Automatically
capture request logs, errors, and traces with trace IDs — on Cloudflare
Workers, Node.js, Bun, or Deno.

## Installation

```bash
npm install @flarelog/sdk hono
```

`hono` is a peer dependency — install it if you haven't already.

## Quick Start

### Zero-config — works everywhere (recommended)

```typescript
import { Hono } from "hono";
import { honoMiddleware } from "@flarelog/sdk/hono";

const app = new Hono();
app.use("*", honoMiddleware());

app.get("/api/hello", (c) => {
  c.get("logger").info("Hello!");
  return c.json({ ok: true });
});

export default app;
```

The SDK auto-detects the runtime and reads `FLARELOG_API_KEY` from:

1. `c.env` — Hono's request context, which exposes Worker `env` bindings on
   Cloudflare Workers (incl. Lovable, Cloudflare Pages Functions).
2. `process.env` — Node.js, Bun, Deno.

It also auto-sets `workerMode: true` on Workers (so logs flush on every event
instead of waiting for a 5s timer that never fires) and calls `logger.flush()`
after each request so the Worker doesn't suspend mid-export.

> Deploying to Cloudflare Workers / Lovable? See the
> [Cloudflare Workers platform guide](/platforms/cloudflare-workers) for
> full setup including secrets.

### Eager logger — when you want custom config

```typescript
import { Hono } from "hono";
import { flarelog } from "@flarelog/sdk";
import { honoMiddleware } from "@flarelog/sdk/hono";

const logger = flarelog({
  apiKey: process.env.FLARELOG_API_KEY!, // works on Node/Bun; on Workers use the factory form
  sampleRate: 0.1,
});

const app = new Hono();
app.use("*", honoMiddleware(logger));
```

### Factory — full custom control (e.g. multi-tenant)

```typescript
import { Hono } from "hono";
import { flarelog } from "@flarelog/sdk";
import { honoMiddleware } from "@flarelog/sdk/hono";

const app = new Hono();
app.use("*", honoMiddleware((c) => {
  // c.env is available per-request on Workers
  return flarelog({ apiKey: c.env.TENANT_KEY, workerMode: true });
}));
```

## What Gets Logged Automatically

Every request that flows through the middleware is logged with:

- **Trace ID**: From `x-trace-id` request header or auto-generated UUID
- **Method**: HTTP method (GET, POST, etc.)
- **Path**: Request path (from `c.req.path`)
- **Duration**: Request duration in milliseconds
- **Status**: Response status code from `c.res.status`

### Log Levels by Status Code

| Status Range | Log Level |
|-------------|-----------|
| 2xx-3xx | INFO |
| 4xx | WARN |
| 5xx | ERROR |

### Error Capture

Unhandled errors thrown by `next()` are automatically captured with:

- Full error stack trace
- Request context (method, path, traceId)
- Duration at point of failure

The error is re-thrown after logging so Hono's normal error handling still runs.

### Flush Guarantee

The middleware calls `await logger.flush()` after each request (both on the
success path and on the error path). This is necessary on Cloudflare Workers,
where the Worker may be suspended the moment the response is returned;
without an explicit flush, the in-flight `fetch()` to your FlareLog/OTLP
backend gets cancelled and the log is silently dropped.

On Node/Bun the extra flush is a cheap no-op because the batch processor has
already drained via its 5-second timer.

## Using the Logger in Handlers

The middleware attaches a child logger to the Hono context via `c.set("logger", ...)`.
Access it in your handlers:

```typescript
app.get("/api/orders/:id", async (c) => {
  const logger = c.get("logger");
  const orderId = c.req.param("id");

  logger.info("Fetching order", { orderId });

  const order = await fetchOrder(orderId);
  if (!order) {
    logger.warn("Order not found", { orderId });
    return c.json({ error: "Not found" }, 404);
  }

  // Create a scoped child logger for multi-step operations
  const scopedLogger = logger.child({ operation: "fetch-items" });
  const items = await fetchItems(order.id);
  scopedLogger.info("Items fetched", { count: items.length });

  return c.json({ order, items });
});
```

## Environment Variables

```bash
# .env (local dev / Node / Bun)
FLARELOG_API_KEY=fl_your_api_key
FLARELOG_ENVIRONMENT=production
FLARELOG_RELEASE=1.2.3
FLARELOG_SERVER_NAME=hono-app
```

On Cloudflare Workers, do **not** rely on `process.env`. Add the secrets in
your Cloudflare/Lovable dashboard and the middleware will read them from
`c.env` automatically.

```toml
# wrangler.toml — for plaintext vars (not recommended for API keys)
[vars]
FLARELOG_ENVIRONMENT = "production"

# For secrets, use: wrangler secret put FLARELOG_API_KEY
```

## Best Practices

1. **Use `c.get("logger")`** in handlers — not the root logger — to keep
   trace context attached.
2. **Log early**: Log at the start of handlers.
3. **Include IDs**: Add userId, orderId, etc. to every log.
4. **Use child loggers**: Create scoped loggers for complex operations.
5. **Let the middleware handle errors**: Don't wrap your handlers in
   try/catch just to log — the middleware does it for you. Only catch if you
   want to transform the response.
6. **Use the zero-arg form on Workers**: Don't read `process.env.FLARELOG_API_KEY`
   at module load on Workers. Use `honoMiddleware()` (no args) and let the
   SDK read `c.env` per request.

## TypeScript Support

Hono is an optional peer dependency. The SDK's `Context` type is inlined to
avoid a hard dep — it covers the standard Hono context shape (`c.req`,
`c.res`, `c.set`, `c.env`). If your Hono version uses a different shape,
cast or use the factory form to construct your own logger.

## See also

- [Cloudflare Workers platform guide](/platforms/cloudflare-workers) — the
  underlying runtime. Covers `c.env` bindings, `wrangler.toml` setup, and
  how secrets reach your code.
- [TanStack Start framework guide](/frameworks/tanstack-start) — same
  zero-config pattern, applied to TanStack Start.
