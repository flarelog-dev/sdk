# FlareLog SDK - Quick Start

## Installation

```bash
npm install @flarelog/sdk
```

Framework and platform integrations are included — no extra installs needed.

---

## Which integration do I use?

| Your stack | Import | What you get |
|---|---|---|
| **Express** | `@flarelog/sdk/express` | `expressMiddleware` + `expressErrorHandler`, `req.logger` |
| **Hono** | `@flarelog/sdk/hono` | `honoMiddleware`, `c.get("logger")` |
| **Next.js** (API routes) | `@flarelog/sdk/next` | `withFlareLog`, `req.logger` + `req.traceId` |
| **React** (browser) | `@flarelog/sdk/react` | `FlareLogErrorBoundary`, `useFlareLog` hook |
| **TanStack Start** | `@flarelog/sdk/tanstack-start` | Server function + client wrappers |
| **Cloudflare Workers** (plain) | `@flarelog/sdk/cf-workers` | `workerFetch`, full OTel spans, `ctx.waitUntil` flush |
| **Vercel** (standalone API, Edge, Middleware) | `@flarelog/sdk/vercel` | `withVercelServerless` + `withVercelEdge` |
| **No framework / custom** | `@flarelog/sdk` | Core `flarelog()` factory, spans, `logError`, breadcrumbs |

### Not sure? Here's the decision flow:

```
Are you using a framework?
├── Yes
│   ├── Express    → @flarelog/sdk/express
│   ├── Hono       → @flarelog/sdk/hono
│   ├── Next.js    → @flarelog/sdk/next
│   ├── React      → @flarelog/sdk/react
│   └── TanStack   → @flarelog/sdk/tanstack-start
└── No (plain handler)
    ├── Cloudflare Workers → @flarelog/sdk/cf-workers
    ├── Vercel Serverless  → @flarelog/sdk/vercel (withVercelServerless)
    ├── Vercel Edge        → @flarelog/sdk/vercel (withVercelEdge)
    └── Node.js / other    → @flarelog/sdk (core)
```

### Common confusion points

- **"Next.js on Vercel"** → Use `@flarelog/sdk/next`. The Next.js integration works on any hosting platform; Vercel is just deployment.
- **"React on Vercel"** → Use `@flarelog/sdk/react` for the client side, `@flarelog/sdk/next` for API routes.
- **"Vercel without Next.js"** → Use `@flarelog/sdk/vercel` for standalone `api/` routes, Edge Functions, and Middleware.
- **"Hono on Cloudflare Workers"** → Use `@flarelog/sdk/hono` for the middleware. Optionally pair with `@flarelog/sdk/cf-workers` for `workerFetch`.

> **Rule of thumb**: Pick the **framework** integration first. Only reach for the **platform** integration (`cf-workers`, `vercel`) when you don't use a framework or need platform-specific features like OTel span auto-creation or execution-context flushing.

---

## Quick Start by Stack

### Express.js

```typescript
import { flarelog } from "@flarelog/sdk";
import { expressMiddleware, expressErrorHandler } from "@flarelog/sdk/express";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

app.use(expressMiddleware(logger));
app.use(expressErrorHandler(logger));
```

### Hono

```typescript
import { flarelog } from "@flarelog/sdk";
import { honoMiddleware } from "@flarelog/sdk/hono";

const logger = flarelog({ apiKey: env.FLARELOG_API_KEY });

app.use("*", honoMiddleware(logger));
```

### Next.js

```typescript
import { flarelog } from "@flarelog/sdk";
import { withFlareLog } from "@flarelog/sdk/next";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withFlareLog(logger, async (req, res) => {
  req.logger.info("Processing request");
  res.json({ data: "Hello" });
});
```

### React (Browser)

```tsx
import { flarelog } from "@flarelog/sdk";
import { FlareLogErrorBoundary, useFlareLog } from "@flarelog/sdk/react";

const logger = flarelog({ apiKey: process.env.REACT_APP_FLARELOG_API_KEY });

// Error Boundary
<FlareLogErrorBoundary logger={logger}>
  <App />
</FlareLogErrorBoundary>

// Hook
const { trackEvent } = useFlareLog(logger);
trackEvent("button_clicked", { button: "checkout" });
```

### Cloudflare Workers

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

const logger = flarelog({ apiKey: env.FLARELOG_API_KEY });

export default {
  fetch: workerFetch(logger, async (request, env, ctx) => {
    logger.info("Hello from worker!");
    return new Response("Hello");
  }),
};
```

### Vercel Serverless Functions

```typescript
import { flarelog } from "@flarelog/sdk";
import { withVercelServerless } from "@flarelog/sdk/vercel";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withVercelServerless(logger, async (req, res) => {
  req.logger.info("Processing request");
  res.json({ data: "Hello" });
});
```

### Vercel Edge Functions

```typescript
import { flarelog } from "@flarelog/sdk";
import { withVercelEdge } from "@flarelog/sdk/vercel";

export const config = { runtime: "edge" };
const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withVercelEdge(logger, async (request) => {
  return new Response("Hello from the edge!");
});
```

---

## Framework vs Platform Integrations

Understanding the difference helps you pick the right one:

| | Framework integrations | Platform integrations |
|---|---|---|
| **Examples** | `/express`, `/hono`, `/next`, `/react`, `/tanstack-start` | `/cf-workers`, `/vercel` |
| **Tied to** | A web framework | A deployment runtime |
| **Works on** | Any platform that runs the framework | Only the specific platform |
| **What they do** | Attach logger to framework objects (`req.logger`, `c.get("logger")`) | OTel span creation, execution-context flushing, env detection |
| **When to use** | You're using that framework (always preferred) | You're writing raw handlers without a framework |

### Overlap examples

| Scenario | Use | Reason |
|---|---|---|
| Next.js on Vercel | `/next` | Framework integration is the right abstraction |
| Next.js on a VPS | `/next` | Same — framework integration is platform-agnostic |
| Hono on Cloudflare Workers | `/hono` | Framework integration; Hono runs natively on Workers |
| Plain Worker (no framework) | `/cf-workers` | Need platform-specific `workerFetch` + `ctx.waitUntil` |
| Vercel API route (no Next.js) | `/vercel` | Need platform-specific Serverless/Edge wrappers |
| Express on Vercel Serverless | `/express` | Framework integration; runs on Node.js under the hood |

---

## The `flarelog()` Factory

The `flarelog()` function creates a `FlareLog` instance with sensible defaults:

- **Auto-detects environment**: `development`, `production`, etc. (reads `VERCEL_ENV`, `NODE_ENV`, CF env)
- **Auto-detects release**: from `npm_package_version`, `VERCEL_GIT_COMMIT_SHA`, `CF_PAGES_COMMIT_SHA`
- **Auto-detects server name**: hostname or `VERCEL_REGION`
- **Auto-detects platform**: Cloudflare Workers, Vercel, Node.js, browser — adjusts batching and flushing
- **Auto-enables capture**: console, globalErrors, rejections

```typescript
import { flarelog } from "@flarelog/sdk";

const logger = flarelog({
  apiKey: "fl_your_api_key",
  // Everything else is auto-detected!
});
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | string | optional | Your FlareLog API key (or set `FLARELOG_API_KEY`) |
| `endpoint` | string | `https://flarelog.dev` | API endpoint |
| `level` | LogLevel | `DEBUG` | Minimum log level |
| `environment` | string | auto-detected | Environment name |
| `release` | string | auto-detected | Release version |
| `serverName` | string | auto-detected | Server identifier |
| `batchSize` | number | `50` (Node), `1` (Worker/Edge) | Logs to batch before sending |
| `flushIntervalMs` | number | `5000` (Node), `0` (Worker/Edge) | Max time before flushing |
| `maxBatchSize` | number | `100` | Max in-flight buffer size |
| `workerMode` | boolean | auto-detected | Enable worker-optimized batching |
| `sampleRate` | number | `1.0` | Log sampling rate (0-1) |
| `beforeSend` | function | - | Modify/drop logs before sending |
| `autoCapture` | object | `{console, globalErrors, rejections}` | Auto-capture config |
| `otlpEndpoint` | string | optional | OTLP endpoint (or set `OTEL_EXPORTER_OTLP_ENDPOINT`) |
| `otlpHeaders` | object | optional | OTLP auth headers |
| `transports` | array | auto-detected | Explicit transport list |

## Log Levels

- `TRACE` - Detailed debugging
- `DEBUG` - Development debugging
- `INFO` - General information
- `WARN` - Warning events
- `ERROR` - Error events
- `FATAL` - Critical errors

## Core Methods

```typescript
// Logging
logger.trace(message, metadata?)
logger.debug(message, metadata?)
logger.info(message, metadata?)
logger.warn(message, metadata?)
logger.error(message, metadata?)
logger.fatal(message, metadata?)

// Error handling
logger.logError(error, { message, metadata, source })
await logger.capture(() => riskyOperation(), { label: "Operation" })

// Context
logger.setUser({ id, email, name })
logger.setTag(key, value)
logger.addBreadcrumb({ category, message, data })

// Control
await logger.flush()
logger.destroy()
```

## Guides

- [Cloudflare Workers Guide](/platforms/cloudflare-workers) - Workers, Durable Objects, Queues, Cron
- [Vercel Guide](/platforms/vercel) - Serverless Functions, Edge Functions, Middleware
- [Browser Guide](/guides/browser-guide) - React, Vue, Next.js, Svelte
- [Node.js Guide](/guides/nodejs-guide) - Express, Fastify, NestJS
- [Advanced Features](/guides/advanced-features) - Breadcrumbs, tags, beforeSend, spans