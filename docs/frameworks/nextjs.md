# FlareLog SDK - Next.js Guide

`@flarelog/sdk/next` provides drop-in wrappers for the three server-side runtimes you use in a Next.js app:

- **`withFlareLog`** — Pages Router API routes (`pages/api/*.ts`) on the Node.js runtime
- **`withNextRouteHandler`** — App Router Route Handlers (`app/api/*/route.ts`)
- **`withNextMiddleware`** — Edge Middleware (`middleware.ts`)

All three extract distributed trace context and flush telemetry before the invocation ends.

## Quick Start

### Pages Router

```typescript
// pages/api/hello.ts
import { flarelog } from "@flarelog/sdk";
import { withFlareLog } from "@flarelog/sdk/next";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withFlareLog(logger, async (req, res) => {
  req.logger.info("Hello from Next.js!");
  res.json({ message: "Hello" });
});
```

### App Router Route Handler

```typescript
// app/api/hello/route.ts
import { flarelog } from "@flarelog/sdk";
import { withNextRouteHandler } from "@flarelog/sdk/next";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export const GET = withNextRouteHandler(logger, async (request) => {
  return Response.json({ message: "Hello from App Router!" });
});
```

### Edge Middleware

```typescript
// middleware.ts
import { NextResponse } from "next/server";
import { flarelog } from "@flarelog/sdk";
import { withNextMiddleware } from "@flarelog/sdk/next";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withNextMiddleware(logger, async (request) => {
  logger.info("Middleware executed", { path: new URL(request.url).pathname });
  return NextResponse.next();
});
```

Without an API key, logs are written to the console by default, so you can start developing immediately.

## Pages Router API Routes

`withFlareLog` is built for the classic `(req, res)` Node.js API route. It:

- Extracts a `traceId` from the `x-trace-id` header or the W3C `traceparent` header, falling back to a random UUID
- Creates a request-scoped child logger and exposes it as `req.logger` (plus `req.traceId`)
- Listens to `res.on("finish")` so the logged status code is always the final one
- Maps status codes to log levels: `5xx` → `ERROR`, `4xx` → `WARN`, else `INFO`
- Captures unhandled errors with `logError`, sends a `500` response if headers haven't been sent, and re-throws
- Flushes telemetry before the invocation ends so nothing is lost during cold starts

### Example: calling downstream services

```typescript
// pages/api/users/[id].ts
import { flarelog } from "@flarelog/sdk";
import { withFlareLog } from "@flarelog/sdk/next";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withFlareLog(logger, async (req, res) => {
  const { id } = req.query;
  const child = req.logger.child({ userId: id });

  child.info("Fetching user");

  try {
    const user = await db.users.findById(id as string);
    if (!user) {
      child.warn("User not found");
      return res.status(404).json({ error: "Not found" });
    }
    child.info("User fetched");
    return res.status(200).json(user);
  } catch (err) {
    child.logError(err, { message: "Failed to fetch user" });
    // withFlareLog will send 500 automatically; re-throw if you want it surfaced.
    throw err;
  }
});
```

## App Router Route Handlers

`withNextRouteHandler` uses the Web `Request` / `Response` API. For `FlareLog` instances it emits a full OTel `SPAN_KIND_SERVER` span via `logger.withRequest`, giving you complete trace context, automatic exception recording, and flush-on-completion.

```typescript
// app/api/hello/route.ts
import { flarelog } from "@flarelog/sdk";
import { withNextRouteHandler } from "@flarelog/sdk/next";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export const GET = withNextRouteHandler(logger, async (request) => {
  const url = new URL(request.url);
  logger.info("Handling App Router request", { path: url.pathname });

  const data = await fetchData();
  return Response.json(data);
});
```

Logs emitted inside the handler are automatically correlated to the active span's `traceId` and `spanId`.

## Edge Middleware

`withNextMiddleware` wraps a `middleware.ts` function. It has the same Web `Request` / `Response` shape as `withNextRouteHandler` and is safe for the Edge runtime.

```typescript
// middleware.ts
import { NextResponse } from "next/server";
import { flarelog } from "@flarelog/sdk";
import { withNextMiddleware } from "@flarelog/sdk/next";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withNextMiddleware(logger, async (request) => {
  const url = new URL(request.url);

  logger.info("Edge middleware", {
    path: url.pathname,
    search: url.search,
  });

  return NextResponse.next();
});
```

The wrapper returns whatever `Response` your handler returns, so `NextResponse.rewrite()`, `NextResponse.redirect()`, and `NextResponse.next()` all work unchanged.

## Trace context propagation

All three wrappers look for trace context in this order:

1. W3C `traceparent` header — preferred (`00-<traceId>-<spanId>-<flags>`)
2. Legacy `x-trace-id` header — for backwards compatibility
3. Auto-generated UUID

For outgoing requests from inside your handler, use `logger.injectTraceContext(headers)` to continue the trace:

```typescript
const headers = new Headers();
logger.injectTraceContext(headers);
const data = await fetch("https://api.example.com/orders", { headers });
```

## Environment variables

The wrappers themselves do not read framework-specific env vars, but `flarelog()` picks up the standard ones:

| Variable | Purpose |
|----------|---------|
| `FLARELOG_API_KEY` | Ships logs and traces to FlareLog |
| `FLARELOG_ENDPOINT` | Override the Flarelog endpoint |
| `FLARELOG_ENVIRONMENT` | Deployment environment name |
| `FLARELOG_RELEASE` | Release version or git SHA |
| `FLARELOG_SERVER_NAME` | Host or instance name |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Fan-out to any OTLP-compatible backend |
| `OTEL_EXPORTER_OTLP_HEADERS` | OTLP headers (`Key=Value`) |
| `OTEL_RESOURCE_ATTRIBUTES` | Extra resource attributes (`service.name=foo`) |

Use `FLARELOG_API_KEY` in your server-side code. If you also log from the browser, create a separate client-side logger that reads a *public* API key from `NEXT_PUBLIC_*` variables.

## Client-side logging in the browser

For React components, use the React integration instead:

```typescript
// components/FlareLogErrorBoundary.tsx
"use client";

import { FlareLogErrorBoundary } from "@flarelog/sdk/react";
import { clientLogger } from "../lib/flarelog-client";

export function ErrorBoundaryWrapper({ children }: { children: React.ReactNode }) {
  return <FlareLogErrorBoundary logger={clientLogger}>{children}</FlareLogErrorBoundary>;
}
```

See [Browser Guide](/guides/browser) for `useFlareLog`, `useFlareLogPageView`, and global error capture.

## TypeScript

`@flarelog/sdk/next` does not import `next` at runtime, so it stays zero-dependency even after the optional peer dependency. If you want full framework types in your handler signature, import them from `next` as usual:

```typescript
import type { NextApiRequest, NextApiResponse } from "next";
import type { FlareLogLike } from "@flarelog/sdk";
import { withFlareLog } from "@flarelog/sdk/next";

export default withFlareLog(logger, async (
  req: NextApiRequest & { logger: FlareLogLike; traceId: string },
  res: NextApiResponse
) => {
  res.json({ ok: true });
});
```
