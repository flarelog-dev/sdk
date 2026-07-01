# FlareLog SDK - Cloudflare Workers Guide

Zero-config observability for Cloudflare Workers — including Workers Sites, Durable Objects, Queues, and Cron Triggers. The SDK auto-detects the Workers runtime, reads secrets from the `env` binding (not `process.env`), and flushes telemetry via `ctx.waitUntil()` so logs and traces aren't dropped when the Worker suspends.

> **Using Hono or TanStack Start on Workers?** Use the [Hono](/frameworks/hono) or [TanStack Start](/frameworks/tanstack-start) framework integration instead — they handle the `env` binding automatically. This guide is for raw Workers handlers.

## Quick Start (3 lines)

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

export default {
  fetch: (request, env, ctx) => {
    const logger = flarelog({ apiKey: env.FLARELOG_API_KEY });
    return workerFetch(logger, async (request, env, ctx) => {
      logger.info("Hello from worker!");
      return new Response("Hello");
    })(request, env, ctx);
  },
};
```

The `flarelog()` factory auto-detects environment and enables console/globalErrors/rejections capture by default. For Cloudflare Workers, it automatically applies worker-optimized settings (`batchSize: 1`, `flushIntervalMs: 0`) to prevent log loss on short-lived executions.

## Worker Mode

When `workerMode: true` is set (or auto-detected), the SDK uses aggressive flushing optimized for the Workers runtime:

- **batchSize: 1** — Flush immediately on every log
- **flushIntervalMs: 0** — No timer-based flushing (Workers may not live long enough)
- **maxBatchSize: 100** — Cap in-flight buffer for burst protection
- **Automatic ctx.waitUntil** — `workerFetch()` and `withRequest()` guarantee delivery via `ctx.waitUntil()` on completion
- **Graceful fallback** — If `ctx.waitUntil` is unavailable (e.g., tests), falls back to blocking `await logger.flush()`

This ensures logs are never lost due to Worker cold starts or short execution times, while still batching efficiently within a single request's lifetime.

## Simple Worker (No Framework)

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

export default {
  fetch: (request, env, ctx) => {
    const logger = flarelog({ apiKey: env.FLARELOG_API_KEY });
    return workerFetch(logger, async (request, env, ctx) => {
      logger.info("Request received", { url: request.url, method: request.method });

      try {
        const result = await handleRequest(request, env);
        logger.info("Request completed", { status: 200 });
        return result;
      } catch (err) {
        logger.logError(err, { message: "Request failed" });
        return new Response("Internal Error", { status: 500 });
      }
    })(request, env, ctx);
  },
};
```

## With Hono Framework

The Hono middleware auto-detects Cloudflare Workers and reads `FLARELOG_API_KEY`
from `c.env` (the Worker binding) — no need to instantiate the logger manually.

```typescript
import { Hono } from "hono";
import { honoMiddleware } from "@flarelog/sdk/hono";

const app = new Hono();

// Zero-config: SDK reads FLARELOG_API_KEY from c.env on Workers,
// or process.env on Node/Bun. Caches the logger across requests.
app.use("*", honoMiddleware());

app.get("/api/users/:id", async (c) => {
  const log = c.get("logger");
  const userId = c.req.param("id");
  
  log.info("Fetching user", { userId });
  
  try {
    const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
    
    if (!user) {
      log.warn("User not found", { userId });
      return c.json({ error: "Not found" }, 404);
    }
    
    log.info("User fetched", { userId });
    return c.json(user);
  } catch (err) {
    log.logError(err, { message: "Failed to fetch user", metadata: { userId } });
    return c.json({ error: "Internal error" }, 500);
  }
});

export default app;
```

For custom config, pass an explicit logger or a factory:

```typescript
import { flarelog } from "@flarelog/sdk";
import { honoMiddleware } from "@flarelog/sdk/hono";

// Eager logger (works on Node/Bun; on Workers use the factory form below)
app.use("*", honoMiddleware(flarelog({ apiKey: process.env.FLARELOG_API_KEY! })));

// Or: factory with access to c.env (e.g. multi-tenant)
app.use("*", honoMiddleware((c) => flarelog({ apiKey: c.env.TENANT_KEY })));
```

See the [Hono framework guide](/frameworks/hono) for the full API.

## With Itty-Router (Dead Simple)

```typescript
import { Router } from "itty-router";
import { flarelog, workerFetch } from "@flarelog/sdk";

const router = Router();

router.get("/api/hello", async (request, env, ctx) => {
  const logger = flarelog({ apiKey: env.FLARELOG_API_KEY });
  logger.info("Hello endpoint called");
  return new Response("Hello World!");
});

export default {
  fetch: (request, env, ctx) => {
    const logger = flarelog({ apiKey: env.FLARELOG_API_KEY });
    return workerFetch(logger, router.handle)(request, env, ctx);
  },
};
```

## Durable Objects

```typescript
import { DurableObject } from "cloudflare:workers";
import { FlareLog } from "@flarelog/sdk";

export class ChatRoom extends DurableObject {
  private logger: FlareLog;
  private ctx: DurableObjectState;
  
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx = ctx;
    
    this.logger = new FlareLog({
      apiKey: env.FLARELOG_API_KEY,
      environment: "production",
      serverName: `do-${ctx.id.toString()}`,
    });
  }
  
  async fetch(request: Request) {
    return this.logger.withRequest(
      { request, metadata: { roomId: this.ctx.id.toString() } },
      { waitUntil: (p) => this.ctx.waitUntil(p) },
      async () => {
        this.logger.info("Chat room request", {
          roomId: this.ctx.id.toString(),
        });
        
        // Handle WebSocket or HTTP request
        return new Response("OK");
      }
    );
  }
}
```

## Cloudflare Pages Functions

Cloudflare Pages Functions use the same Workers runtime but have a different API shape. The `pagesFunction()` wrapper handles this automatically:

```typescript
// functions/api/hello.ts
import { flarelog, pagesFunction } from "@flarelog/sdk";

const logger = flarelog({ apiKey: "fl_your_key" });

export const onRequest = pagesFunction(logger, async (context) => {
  logger.info("Hello from Pages", { url: context.request.url });
  return new Response("Hello from Pages Functions!");
});
```

### With Middleware

```typescript
// functions/_middleware.ts
import { flarelog, pagesFunction } from "@flarelog/sdk";

const logger = flarelog({});

export const onRequest = pagesFunction(logger, async (context) => {
  logger.info("Middleware running", { path: new URL(context.request.url).pathname });
  return context.next();
});
```

### Dynamic Routes

```typescript
// functions/api/users/[id].ts
import { flarelog, pagesFunction } from "@flarelog/sdk";

const logger = flarelog({ apiKey: "fl_your_key" });

export const onRequest = pagesFunction(logger, async (context) => {
  const userId = context.params?.id;
  logger.info("Fetching user", { userId });
  
  try {
    const user = await context.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
    
    if (!user) {
      logger.warn("User not found", { userId });
      return new Response("Not found", { status: 404 });
    }
    
    logger.info("User fetched", { userId });
    return Response.json(user);
  } catch (err) {
    logger.logError(err, { message: "Failed to fetch user", metadata: { userId } });
    return new Response("Internal error", { status: 500 });
  }
});
```

### Pages Functions with waitUntil

The `pagesFunction()` wrapper automatically handles `context.waitUntil()` for flushing telemetry, just like `workerFetch()` does for standard Workers:

```typescript
import { flarelog, pagesFunction } from "@flarelog/sdk";

const logger = flarelog({ apiKey: "fl_your_key" });

export const onRequest = pagesFunction(logger, async (context) => {
  // Logs are automatically flushed via context.waitUntil()
  logger.info("Processing request");
  
  // You can also manually wait for async operations
  context.waitUntil(someBackgroundTask());
  
  return new Response("OK");
});
```

## Cron Triggers

```typescript
import { FlareLog } from "@flarelog/sdk";

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const logger = new FlareLog({
      apiKey: env.FLARELOG_API_KEY,
      environment: "production",
      workerMode: true,
    });
    
    logger.info("Cron job started", {
      cron: event.cron,
      scheduledTime: event.scheduledTime,
    });
    
    try {
      await runDailyCleanup(env);
      logger.info("Cron job completed");
    } catch (err) {
      logger.logError(err, { message: "Cron job failed" });
    }
    
    ctx.waitUntil(logger.flush());
  },
};
```

## Queue Workers (Cloudflare Queues)

```typescript
import { FlareLog } from "@flarelog/sdk";

export default {
  async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
    const logger = new FlareLog({
      apiKey: env.FLARELOG_API_KEY,
      environment: "production",
      workerMode: true, // Enable worker-optimized batching
    });
    
    logger.info("Processing queue batch", {
      queue: batch.queue,
      messageCount: batch.messages.length,
    });
    
    for (const message of batch.messages) {
      try {
        await processMessage(message);
        message.ack();
        logger.info("Message processed", { messageId: message.id });
      } catch (err) {
        logger.logError(err, {
          message: "Message processing failed",
          metadata: { messageId: message.id },
        });
        message.retry();
      }
    }
    
    ctx.waitUntil(logger.flush());
  },
};
```

## R2 Object Storage

```typescript
import { FlareLog } from "@flarelog/sdk";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const logger = new FlareLog({
      apiKey: env.FLARELOG_API_KEY,
      environment: "production",
    });

    return logger.withRequest(
      { request, traceId: crypto.randomUUID() },
      ctx,
      async () => {
        const url = new URL(request.url);
        const key = url.pathname.slice(1);
        
        if (request.method === "PUT") {
          logger.info("Uploading to R2", { key, size: request.headers.get("content-length") });
          
          try {
            await env.MY_BUCKET.put(key, request.body);
            logger.info("Upload complete", { key });
            return new Response("Uploaded", { status: 200 });
          } catch (err) {
            logger.logError(err, { message: "R2 upload failed", metadata: { key } });
            return new Response("Upload failed", { status: 500 });
          }
        }
        
        // ... handle GET, DELETE, etc.
      }
    );
  },
};
```

## KV Storage

```typescript
import { FlareLog } from "@flarelog/sdk";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const logger = new FlareLog({
      apiKey: env.FLARELOG_API_KEY,
      environment: "production",
    });
    const traceId = crypto.randomUUID();
    const log = logger.child({ traceId, source: "kv-handler" });
    
    try {
      log.info("KV operation", { method: request.method });
      
      if (request.method === "GET") {
        const key = new URL(request.url).searchParams.get("key");
        const value = await env.MY_KV.get(key);
        
        if (!value) {
          log.warn("KV key not found", { key });
          return new Response("Not found", { status: 404 });
        }
        
        log.info("KV read", { key, size: value.length });
        return new Response(value);
      }
      
      // ... handle PUT, DELETE
    } catch (err) {
      log.logError(err, { message: "KV operation failed" });
      return new Response("Error", { status: 500 });
    } finally {
      ctx.waitUntil(logger.flush());
    }
  },
};
```

## Service Bindings (Worker-to-Worker)

```typescript
import { FlareLog } from "@flarelog/sdk";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const logger = new FlareLog({
      apiKey: env.FLARELOG_API_KEY,
      environment: "production",
    });

    return logger.withRequest(
      { request },
      ctx,
      async () => {
        logger.info("API Gateway request", { path: new URL(request.url).pathname });
        
        // Forward to backend worker, propagating W3C trace context
        const backendRequest = new Request(request);
        logger.injectTraceContext(backendRequest.headers);
        
        try {
          const response = await env.BACKEND_WORKER.fetch(backendRequest);
          logger.info("Backend response", { status: response.status });
          return response;
        } catch (err) {
          logger.logError(err, { message: "Backend call failed" });
          return new Response("Gateway Error", { status: 502 });
        }
      }
    );
  },
};
```

## Environment Variables

In Cloudflare Workers, environment variables and secrets are available only
inside the handler's `env` argument — not on `process.env`. Pass them explicitly
to `flarelog()` or `new FlareLog()`.

```toml
# wrangler.toml
[vars]
FLARELOG_ENVIRONMENT = "production"
FLARELOG_RELEASE = "1.2.3"

# Or use secrets for API key
# wrangler secret put FLARELOG_API_KEY
```

```typescript
// types.ts
interface Env {
  FLARELOG_API_KEY: string;
  FLARELOG_ENVIRONMENT: string;
  FLARELOG_RELEASE: string;
  DB: D1Database;
  MY_KV: KVNamespace;
  MY_BUCKET: R2Bucket;
}
```

```typescript
// main.ts
export default {
  fetch(request, env, ctx) {
    const logger = flarelog({
      apiKey: env.FLARELOG_API_KEY,
      environment: env.FLARELOG_ENVIRONMENT,
      release: env.FLARELOG_RELEASE,
    });
    // ...
  },
};
```

## Best Practices

1. **Use workerFetch() or withRequest()**: These handle flushing with `ctx.waitUntil()` when available, falling back to blocking flush otherwise
2. **Set workerMode for non-HTTP handlers**: For Cron, Queues, or manual handlers, set `workerMode: true` to prevent log loss
3. **Set trace IDs**: Pass trace IDs between workers for distributed tracing
4. **Use child loggers**: Create child loggers per request for context
5. **Add breadcrumbs**: Track user actions leading to errors
6. **Set user context**: Identify affected users for faster debugging
7. **Configure autoCapture**: Enable console, globalErrors, and rejections
8. **Use beforeSend**: Scrub PII before sending logs
9. **Set `ignorePaths` for browser noise** (see FAQ below) — keeps `/favicon.ico` and static-asset traffic out of your dashboard

## FAQ

### Why am I seeing 2 calls to `/v1/logs` (and 2 to `/v1/traces`) per page load when I only emit one batch of logs?

This is almost always the browser making **two requests** to your Worker per page load — one for the URL the user typed (e.g. `GET /`) and one for `/favicon.ico` (browsers always try to fetch a favicon). Each request triggers a fresh `workerFetch` invocation → 8 fresh logs + 1 fresh span → 1 batch to `/v1/logs` + 1 batch to `/v1/traces`. Total: **2 + 2 = 4 calls**, each with its own batch of 8 logs / 1 span.

The SDK is behaving correctly — each request gets its own batch. The duplication is at the browser level, not in the batching logic. You can confirm this by checking your Worker's invocation count in the Cloudflare dashboard (you'll see 2 invocations per page load).

**Fix**: add `ignorePaths` to your logger config. Common browser-driven noise worth filtering:

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

export default {
  fetch: workerFetch(
    // Create the logger INSIDE the handler — `env` is not available at module
    // scope on Workers.
    flarelog({
      ignorePaths: [
        "/favicon.ico",        // browsers always fetch this
        "/robots.txt",         // crawlers
        "/sitemap.xml",
        /^\/static\//,         // any static-asset prefix you serve
        /^\/assets\//,
      ],
    }),
    async (request, env, ctx) => {
      // Your handler code — only runs instrumented for non-ignored requests
      return new Response("Hello");
    },
  ),
};
```

`ignorePaths` accepts strings (exact match), RegExps (pattern match), or functions (custom predicate). Matching is done against `new URL(request.url).pathname` only — query string and host are ignored. When a request matches, the SDK skips span creation, log enrichment, and end-of-request flush entirely; your handler still runs and returns its response normally.

### What about `OPTIONS` and `HEAD` requests?

The SDK automatically bypasses instrumentation for `OPTIONS` and `HEAD` requests — they're almost always CORS preflight or cache-validation traffic that shouldn't generate telemetry. This mirrors `@sentry/cloudflare`'s behavior. You don't need to configure anything for this.

### I'm still seeing duplicate calls — what else could it be?

1. **You have both `FLARELOG_API_KEY` and `OTEL_EXPORTER_OTLP_ENDPOINT=https://flarelog.dev` set** — this creates two transports that both target Flarelog and every batch gets sent twice (once to `/v1/*` via OTLP, once to `/api/v1/*` via the Flarelog transport). Fix: either unset `OTEL_EXPORTER_OTLP_ENDPOINT` (the SDK auto-detects this and skips the OTLP transport), or set it to a different backend like Grafana Cloud.
2. **You wrapped your handler twice** — `workerFetch(logger, workerFetch(logger, handler))` creates two nested `withRequest` calls and two SERVER spans per request. Don't double-wrap.
3. **You're calling `logger.flush()` manually inside the handler** — `workerFetch()` already flushes at request end via `ctx.waitUntil()`. Calling `flush()` again mid-handler is fine (the chain dedupes), but doing it on every log is wasteful.



## Error Handling Patterns

```typescript
// Pattern 1: withRequest (recommended for HTTP handlers)
return logger.withRequest({ request, traceId }, ctx, async () => {
  // Your handler code
});

// Pattern 2: capture (for async operations)
const result = await logger.capture(
  () => riskyOperation(),
  { label: "Payment processing", metadata: { orderId } }
);

// Pattern 3: manual try/catch with logError
try {
  await operation();
} catch (err) {
  logger.logError(err, {
    message: "Operation failed",
    metadata: { context: "additional info" }
  });
}
```
