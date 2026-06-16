# FlareLog SDK - Cloudflare Workers Guide

## Quick Start (3 lines)

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

const logger = flarelog({ apiKey: env.FLARELOG_API_KEY, project: "my-worker" });

export default {
  fetch: workerFetch(logger, async (request, env, ctx) => {
    logger.info("Hello from worker!");
    return new Response("Hello");
  }),
};
```

The `flarelog()` factory auto-detects environment and enables console/globalErrors/rejections capture by default.

## Simple Worker (No Framework)

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

const logger = flarelog({ apiKey: env.FLARELOG_API_KEY, project: "my-worker" });

export default {
  fetch: workerFetch(logger, async (request, env, ctx) => {
    logger.info("Request received", { url: request.url, method: request.method });
    
    try {
      const result = await handleRequest(request, env);
      logger.info("Request completed", { status: 200 });
      return result;
    } catch (err) {
      logger.logError(err, { message: "Request failed" });
      return new Response("Internal Error", { status: 500 });
    }
  }),
};
```

## With Hono Framework

```typescript
import { Hono } from "hono";
import { flarelog } from "@flarelog/sdk";
import { honoMiddleware } from "@flarelog/sdk/hono";

const logger = flarelog({ apiKey: env.FLARELOG_API_KEY, project: "hono-app" });

const app = new Hono();

// One-line middleware setup
app.use("*", honoMiddleware(logger));

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

## With Itty-Router (Dead Simple)

```typescript
import { Router } from "itty-router";
import { flarelog, workerFetch } from "@flarelog/sdk";

const logger = flarelog({ apiKey: env.FLARELOG_API_KEY, project: "itty-app" });

const router = Router();

router.get("/api/hello", async (request, env, ctx) => {
  logger.info("Hello endpoint called");
  return new Response("Hello World!");
});

export default { fetch: workerFetch(logger, router.handle) };
```

## Durable Objects

```typescript
import { DurableObject } from "cloudflare:workers";
import { FlareLog } from "@flarelog/sdk";

export class ChatRoom extends DurableObject {
  private logger: FlareLog;
  
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    
    this.logger = new FlareLog({
      apiKey: env.FLARELOG_API_KEY,
      project: "chat-app",
      environment: "production",
      serverName: `do-${ctx.id.toString()}`,
    });
  }
  
  async fetch(request: Request) {
    const traceId = request.headers.get("x-trace-id") || crypto.randomUUID();
    
    return this.logger.withRequest(
      { request, traceId },
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

## Cron Triggers

```typescript
import { FlareLog } from "@flarelog/sdk";

const logger = new FlareLog({
  apiKey: "fl_your_api_key",
  project: "cron-worker",
  environment: "production",
});

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
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

const logger = new FlareLog({
  apiKey: "fl_your_api_key",
  project: "queue-worker",
  environment: "production",
});

export default {
  async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
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

const logger = new FlareLog({
  apiKey: "fl_your_api_key",
  project: "r2-worker",
  environment: "production",
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
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

const logger = new FlareLog({
  apiKey: "fl_your_api_key",
  project: "kv-worker",
  environment: "production",
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
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

const logger = new FlareLog({
  apiKey: "fl_your_api_key",
  project: "api-gateway",
  environment: "production",
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const traceId = request.headers.get("x-trace-id") || crypto.randomUUID();
    
    return logger.withRequest(
      { request, traceId },
      ctx,
      async () => {
        logger.info("API Gateway request", { path: new URL(request.url).pathname });
        
        // Forward to backend worker with trace ID
        const backendRequest = new Request(request, {
          headers: {
            ...Object.fromEntries(request.headers),
            "x-trace-id": traceId,
          },
        });
        
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

```typescript
// wrangler.toml
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
const logger = new FlareLog({
  apiKey: env.FLARELOG_API_KEY,
  project: "my-worker",
  environment: env.FLARELOG_ENVIRONMENT,
  release: env.FLARELOG_RELEASE,
});
```

## Best Practices

1. **Always flush**: Use `ctx.waitUntil(logger.flush())` in Cloudflare Workers
2. **Set trace IDs**: Pass trace IDs between workers for distributed tracing
3. **Use child loggers**: Create child loggers per request for context
4. **Add breadcrumbs**: Track user actions leading to errors
5. **Set user context**: Identify affected users for faster debugging
6. **Configure autoCapture**: Enable console, globalErrors, and rejections
7. **Use beforeSend**: Scrub PII before sending logs

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
