# FlareLog SDK - Vercel Guide

Drop-in wrappers for Vercel Serverless Functions (Node.js runtime), Edge Functions, and Edge Middleware. The SDK auto-detects the Vercel platform via `VERCEL_*` env vars, reads `process.env.FLARELOG_API_KEY` at module load (safe on Vercel), and flushes telemetry before the function invocation ends.

> **Using Next.js on Vercel?** Use the [Next.js integration](/frameworks/nextjs) instead — it works on Vercel and any other hosting platform. This guide is for standalone `api/` routes, Edge Functions, and Middleware that don't use Next.js.

## Quick Start (3 lines)

### Serverless Functions (Node.js runtime)

```typescript
import { flarelog } from "@flarelog/sdk";
import { withVercelServerless } from "@flarelog/sdk/vercel";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withVercelServerless(logger, async (req, res) => {
  req.logger.info("Hello from Vercel!");
  res.json({ message: "Hello" });
});
```

### Edge Functions

```typescript
import { flarelog } from "@flarelog/sdk";
import { withVercelEdge } from "@flarelog/sdk/vercel";

export const config = { runtime: "edge" };

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withVercelEdge(logger, async (request) => {
  return new Response("Hello from the edge!", { status: 200 });
});
```

The `flarelog()` factory auto-detects Vercel environment variables (`VERCEL`, `VERCEL_ENV`, `VERCEL_REGION`, `VERCEL_GIT_COMMIT_SHA`) and applies them as defaults, so you get production-ready logging with zero manual configuration.

## Serverless Functions

Vercel Serverless Functions run on the Node.js runtime and use the traditional `(req, res)` handler signature. The `withVercelServerless` wrapper provides:

- **Automatic trace ID extraction** from `x-trace-id` or W3C `traceparent` headers, with UUID fallback
- **Request-scoped child logger** attached to `req.logger` with method, path, and trace context
- **Response status tracking** via `res.on("finish")` for reliable final status capture
- **Error capture** with automatic 500 response if headers haven't been sent
- **Duration logging** for every request with millisecond precision

### Basic API Route

```typescript
// api/hello.ts
import { flarelog } from "@flarelog/sdk";
import { withVercelServerless } from "@flarelog/sdk/vercel";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withVercelServerless(logger, async (req, res) => {
  req.logger.info("Processing request", { method: req.method, url: req.url });

  try {
    const data = await fetchData();
    res.json({ data });
  } catch (err) {
    req.logger.logError(err, {
      message: "Failed to fetch data",
      metadata: { url: req.url },
    });
    res.status(500).json({ error: "Internal Server Error" });
  }
});
```

### REST API with Multiple Methods

```typescript
// api/users/[id].ts
import { flarelog } from "@flarelog/sdk";
import { withVercelServerless } from "@flarelog/sdk/vercel";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withVercelServerless(logger, async (req, res) => {
  const { id } = req.query;
  const child = req.logger.child({ userId: id });

  switch (req.method) {
    case "GET": {
      child.info("Fetching user", { userId: id });
      const user = await db.users.findById(id as string);

      if (!user) {
        child.warn("User not found", { userId: id });
        return res.status(404).json({ error: "Not found" });
      }

      child.info("User fetched successfully");
      return res.json(user);
    }

    case "DELETE": {
      child.info("Deleting user", { userId: id });
      await db.users.delete(id as string);
      child.info("User deleted");
      return res.status(204).end();
    }

    default:
      res.setHeader("Allow", ["GET", "DELETE"]);
      return res.status(405).json({ error: "Method not allowed" });
  }
});
```

### Background Processing Pattern

```typescript
// api/process.ts
import { flarelog } from "@flarelog/sdk";
import { withVercelServerless } from "@flarelog/sdk/vercel";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withVercelServerless(logger, async (req, res) => {
  // Immediately respond so the client doesn't wait
  res.json({ status: "processing" });

  // Continue work after response (Vercel keeps the function alive briefly)
  try {
    await processInBackground(req.body);
    req.logger.info("Background processing completed");
  } catch (err) {
    req.logger.logError(err, { message: "Background processing failed" });
  }
});
```

## Edge Functions

Vercel Edge Functions run on the V8 runtime (same as Cloudflare Workers) and use the Web API `Request`/`Response` standard. The `withVercelEdge` wrapper provides two instrumentation paths:

- **Full OTel path** (when using a `FlareLog` instance): extracts W3C `traceparent`, creates `SPAN_KIND_SERVER` spans with HTTP semantic attributes, records exceptions, and flushes telemetry — identical instrumentation to `workerFetch()` for Cloudflare Workers
- **Fallback path** (when using a plain `FlareLogLike` logger): creates a child logger with request context and emits start/complete logs — useful for tests and minimal setups

### Basic Edge Function

```typescript
// api/edge-hello.ts
import { flarelog } from "@flarelog/sdk";
import { withVercelEdge } from "@flarelog/sdk/vercel";

export const config = { runtime: "edge" };

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withVercelEdge(logger, async (request) => {
  const url = new URL(request.url);
  const name = url.searchParams.get("name") || "World";

  logger.info("Edge function called", { path: url.pathname, name });

  return new Response(JSON.stringify({ message: `Hello, ${name}!` }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

### Edge Function with External API Call

```typescript
// api/edge-proxy.ts
import { flarelog } from "@flarelog/sdk";
import { withVercelEdge } from "@flarelog/sdk/vercel";

export const config = { runtime: "edge" };

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withVercelEdge(logger, async (request) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("q");

  // Inject trace context into outgoing request for distributed tracing
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${process.env.API_TOKEN}`);
  logger.injectTraceContext(headers);

  try {
    const response = await fetch(`https://api.example.com/search?q=${query}`, { headers });
    const data = await response.json();

    logger.info("Proxy request completed", { status: response.status, query });
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    logger.logError(err, { message: "Proxy request failed", metadata: { query } });
    return new Response(JSON.stringify({ error: "Upstream failure" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

### Edge Function with Geolocation

```typescript
// api/geo.ts
import { flarelog } from "@flarelog/sdk";
import { withVercelEdge } from "@flarelog/sdk/vercel";

export const config = { runtime: "edge" };

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withVercelEdge(logger, async (request) => {
  // Vercel provides geo info on the request object
  const geo = (request as any).geo;
  const country = geo?.country || "unknown";

  logger.info("Geo lookup", { country, city: geo?.city });

  return new Response(JSON.stringify({ country, city: geo?.city }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

## Edge Middleware

Vercel Edge Middleware runs before requests are routed and can rewrite, redirect, or continue to the destination. The `withVercelEdge` wrapper works seamlessly with middleware handlers.

```typescript
// middleware.ts
import { flarelog } from "@flarelog/sdk";
import { withVercelEdge } from "@flarelog/sdk/vercel";
import { NextResponse } from "next/server";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withVercelEdge(logger, async (request) => {
  const url = new URL(request.url);

  logger.info("Middleware executed", {
    path: url.pathname,
    method: request.method,
    userAgent: request.headers.get("user-agent"),
  });

  // Example: redirect unauthenticated users
  const token = request.headers.get("authorization");
  if (!token && url.pathname.startsWith("/api/protected")) {
    logger.warn("Unauthenticated access attempt", { path: url.pathname });
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Example: A/B testing header injection
  const variant = Math.random() > 0.5 ? "B" : "A";
  const response = NextResponse.next();
  response.headers.set("x-ab-variant", variant);

  logger.info("A/B variant assigned", { variant, path: url.pathname });
  return response;
});

export const config = {
  matcher: ["/api/:path*", "/dashboard/:path*"],
};
```

## Environment Detection

The SDK automatically detects the variables below and applies them as defaults
when you use the `flarelog()` factory:

| Variable                | Maps to          | Example                    |
| ----------------------- | ---------------- | -------------------------- |
| `VERCEL`                | Runtime detection| `"1"`                      |
| `VERCEL_ENV`            | `environment`    | `"production"`             |
| `VERCEL_REGION`         | `serverName`     | `"iad1"`                   |
| `VERCEL_GIT_COMMIT_SHA` | `release`        | `"abc123def456"`           |

Additional deployment context (URL, branch, project ID, deployment ID) is
available through the `detectVercelEnv()` helper:

| Variable                | Available via `detectVercelEnv()` | Example                    |
| ----------------------- | --------------------------------- | -------------------------- |
| `VERCEL_URL`            | `.url`                            | `"my-app-abc123.vercel.app"` |
| `VERCEL_GIT_COMMIT_REF` | `.commitRef`                      | `"main"`                   |
| `VERCEL_PROJECT_ID`     | `.projectId`                      | `"prj_xxxxx"`              |
| `VERCEL_DEPLOYMENT_ID`  | `.deploymentId`                   | `"dpl_xxxxx"`              |

### Manual Environment Detection

Use the `detectVercelEnv()` helper to enrich your logs with deployment context:

```typescript
import { flarelog, detectVercelEnv } from "@flarelog/sdk";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

const vercelEnv = detectVercelEnv();
if (vercelEnv) {
  logger.setTag("vercel.region", vercelEnv.region);
  logger.setTag("vercel.commit", vercelEnv.commitSha);
  logger.setTag("vercel.branch", vercelEnv.commitRef);
  logger.info("Running on Vercel", {
    environment: vercelEnv.environment,
    region: vercelEnv.region,
    url: vercelEnv.url,
    commitSha: vercelEnv.commitSha,
    commitRef: vercelEnv.commitRef,
  });
}
```

### Runtime Detection

The `detectRuntime()` function now returns `"vercel"` when running on the Vercel platform, before falling back to `"node"`:

```typescript
import { detectRuntime } from "@flarelog/sdk";

const runtime = detectRuntime();
// On Vercel: "vercel"
// On plain Node.js: "node"
// On Cloudflare Workers: "cloudflare-workers"
```

## Setting Up Environment Variables

In your Vercel project dashboard, add the following environment variables:

```
FLARELOG_API_KEY=fl_your_api_key_here
```

Optionally, to fan out to an OTel backend, set the endpoint and headers. The standard `OTEL_EXPORTER_OTLP_HEADERS` format (`Key=Value`) is parsed automatically when you use `flarelog()`:

```
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-eu-west-0.grafana.net
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64>
```

All `VERCEL_*` variables are automatically set by the platform — no action needed.

### Using the Vercel CLI

```bash
# Add your Flarelog API key
vercel env add FLARELOG_API_KEY

# Add OTLP endpoint for fan-out
vercel env add OTEL_EXPORTER_OTLP_ENDPOINT
vercel env add OTEL_EXPORTER_OTLP_HEADERS
```

## Fan-out to Multiple Backends

Ship logs to both Flarelog and any OTel-compatible backend simultaneously:

```typescript
import { flarelog } from "@flarelog/sdk";

const logger = flarelog({
  transports: [
    { type: "console" },
    { type: "flarelog", apiKey: process.env.FLARELOG_API_KEY },
    {
      type: "otlp",
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      // Or pass headers explicitly if not using OTEL_EXPORTER_OTLP_HEADERS:
      // headers: { Authorization: `Basic ${process.env.OTEL_AUTH_TOKEN}` },
    },
  ],
});
```

## Choosing Between Serverless and Edge

| Feature                  | Serverless (`withVercelServerless`) | Edge (`withVercelEdge`)       |
| ------------------------ | ----------------------------------- | ----------------------------- |
| Runtime                  | Node.js                             | V8 (Edge)                     |
| Handler signature        | `(req, res)`                        | `(request) => Response`       |
| OTel span instrumentation| Child logger only                   | Full `withRequest` spans      |
| W3C trace propagation    | Extract only                        | Extract only                  |
| `req.logger` available   | Yes                                 | No (use closure `logger`)     |
| `req.traceId` available  | Yes                                 | No (use `logger.child()`)     |
| Node.js APIs             | Full access                         | Limited (Web APIs only)       |
| Cold start               | Slower (~250ms)                     | Faster (~50ms)                |
| Max duration             | 60s (Pro: 300s)                     | 30s                           |
| Bundle size              | No constraint                       | Must be small                 |

Use `logger.injectTraceContext(headers)` in either runtime to propagate trace context to outgoing requests.

**When to use Serverless**: You need full Node.js APIs (file system, native modules, database drivers), longer execution times, or the traditional `(req, res)` pattern.

**When to use Edge**: You need low-latency responses, geographic distribution, or your handler only uses Web APIs (fetch, crypto, etc.).

## Error Handling Patterns

### Serverless Function with Capture

```typescript
import { flarelog } from "@flarelog/sdk";
import { withVercelServerless } from "@flarelog/sdk/vercel";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withVercelServerless(logger, async (req, res) => {
  // Pattern 1: capture() wraps async operations
  const user = await logger.capture(
    () => db.users.findById(req.body.userId),
    { label: "Fetch user", metadata: { userId: req.body.userId } }
  );

  if (!user) {
    req.logger.warn("User not found");
    return res.status(404).json({ error: "Not found" });
  }

  // Pattern 2: manual try/catch with logError
  try {
    const order = await createOrder(user, req.body.items);
    req.logger.info("Order created", { orderId: order.id });
    res.json(order);
  } catch (err) {
    req.logger.logError(err, {
      message: "Order creation failed",
      metadata: { userId: user.id },
    });
    res.status(500).json({ error: "Order failed" });
  }
});
```

### Edge Function with Spans

```typescript
import { flarelog } from "@flarelog/sdk";
import { withVercelEdge } from "@flarelog/sdk/vercel";

export const config = { runtime: "edge" };

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withVercelEdge(logger, async (request) => {
  const url = new URL(request.url);

  // Create a manual span for business logic
  return logger.startSpan("process-checkout", async (span) => {
    span.setAttribute("checkout.items_count", 3);

    const result = await processCheckout(request);
    span.setAttribute("checkout.total", result.total);

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  });
});
```

## Best Practices

1. **Use `withVercelServerless` for API routes**: It attaches `req.logger` and `req.traceId` for easy downstream access
2. **Use `withVercelEdge` for Edge Functions and Middleware**: It provides full OTel span instrumentation with W3C trace propagation
3. **Set `FLARELOG_API_KEY` as an environment variable**: The `flarelog()` factory auto-detects it
4. **Use `detectVercelEnv()` for deployment metadata**: Enrich logs with region, commit SHA, and branch info
5. **Add breadcrumbs before error-prone operations**: Track the sequence of events leading to failures
6. **Use `beforeSend` to scrub PII**: Especially important for serverless functions that handle user input
7. **Create child loggers for additional context**: `req.logger.child({ orderId })` adds context to all subsequent logs
8. **Flush manually for long-running operations**: Call `await logger.flush()` after critical operations to ensure delivery

## Troubleshooting

### Logs not appearing in dashboard

1. Verify `FLARELOG_API_KEY` is set in your Vercel project environment variables
2. Ensure the key is exposed to the correct runtime (Serverless or Edge)
3. Check that your API route is actually being invoked (Vercel Functions logs in the dashboard)
4. Try adding `debug: true` to the `flarelog()` config to see diagnostic output

### Edge Function bundle size

The SDK has zero dependencies and is designed to be lightweight, making it suitable for Edge Functions where bundle size matters. If you only need the edge wrapper, import from the sub-path:

```typescript
// Only pulls in the Vercel edge wrapper, not the full SDK
import { withVercelEdge } from "@flarelog/sdk/vercel";
```

### Cold start latency

The SDK initializes quickly and does not perform network calls during construction. The `flarelog()` factory is synchronous and only establishes connections when logs are actually flushed, so it adds negligible overhead to cold starts.
