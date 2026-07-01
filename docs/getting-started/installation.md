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
| **TanStack Start** | `@flarelog/sdk/tanstack-start` | Request middleware, auto Worker env detection |
| **Cloudflare Workers** (plain) | `@flarelog/sdk/cf-workers` | `workerFetch`, full OTel spans, `ctx.waitUntil` flush |
| **Vercel** (standalone API, Edge, Middleware) | `@flarelog/sdk/vercel` | `withVercelServerless` + `withVercelEdge` |
| **No framework / custom** | `@flarelog/sdk` | Core `flarelog()` factory, spans, `logError`, breadcrumbs |

> **Not sure which to pick?** See the full **[Choosing an Integration](/getting-started/choosing-integration)** guide — it has a decision tree, framework-vs-platform comparison, and common confusion points.

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

export default {
  fetch: workerFetch(
    // Create the logger INSIDE the handler — `env` is not available at module
    // scope on Workers. See the Cloudflare Workers guide for details.
    flarelog(),
    async (request, env, ctx) => {
      return new Response("Hello");
    },
  ),
};
```

> **⚠️ Workers anti-pattern:** Don't do `const logger = flarelog({ apiKey: env.FLARELOG_API_KEY })` at module scope — `env` is `undefined` there. Create the logger inside the `fetch` handler (as above), or use `autoLogger(env)` which reads `process.env` / the `cloudflare:workers` binding lazily. See the [Cloudflare Workers guide](/platforms/cloudflare-workers) for the full pattern.

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
| `otlpHeaders` | `Record<string,string>` | optional | OTLP auth headers |
| `transports` | array | auto-detected | Explicit transport list |
| `allowInsecure` | boolean | `false` | Allow HTTP (non-TLS) endpoints |
| `debug` | boolean | `false` | Enable debug mode (verbose console output) |
| `defaultSource` | string | `"flarelog"` | Default `source` field for logs |
| `includeTimestamps` | boolean | `true` | Auto-add `timestamp` to log metadata |
| `serviceName` | string | auto-detected | OTel `service.name` resource attribute |
| `serviceNamespace` | string | optional | OTel `service.namespace` resource attribute |
| `resourceAttributes` | `Record<string,string>` | optional | Extra OTel resource attributes |
| `scrubFields` | `string[]` | `["password","token","secret","key","authorization"]` | Field names to redact from logs (substring match) |
| `onDrop` | function | - | Called when a log is dropped (buffer full, sample miss, etc.) |
| `warnOnConsoleFallback` | boolean | `true` | Warn when no backend is configured (console-only) |
| `ignorePaths` | `(string \| RegExp \| ((path: string) => boolean))[]` | `[]` | Skip instrumentation for matching request paths |

> See [Core API: Configuration](/core-api/configuration) for the full type reference.

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
- [Browser Guide](/guides/browser) - React, Vue, Next.js, Svelte
- [Node.js Guide](/guides/nodejs) - Express, Fastify, NestJS
- [Advanced Features](/guides/advanced) - Breadcrumbs, tags, beforeSend, spans