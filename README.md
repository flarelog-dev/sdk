# @flarelog/sdk

**Zero-dependency observability for any JavaScript runtime.**

> Ships logs, errors, and W3C-propagated traces from Cloudflare Workers, Vercel, Node.js, or the browser to FlareLog or any OTLP backend. One SDK, every platform.

[![npm version](https://img.shields.io/npm/v/@flarelog/sdk)](https://www.npmjs.com/package/@flarelog/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Which integration do I use?

**One import per stack — pick the row that matches yours:**

| Your stack | Import | What it gives you |
|---|---|---|
| **Express** | `@flarelog/sdk/express` | `expressMiddleware` + `expressErrorHandler`, `req.logger` |
| **Hono** | `@flarelog/sdk/hono` | `honoMiddleware`, `c.get("logger")` |
| **Next.js** (API routes) | `@flarelog/sdk/next` | `withFlareLog`, `req.logger` |
| **React** (browser) | `@flarelog/sdk/react` | `FlareLogErrorBoundary`, `useFlareLog` hook |
| **TanStack Start** | `@flarelog/sdk/tanstack-start` | Server function + client wrappers |
| **Cloudflare Workers** | `@flarelog/sdk/cf-workers` | `workerFetch`, OTel spans + `ctx.waitUntil` flush |
| **Vercel** (standalone API, Edge, Middleware) | `@flarelog/sdk/vercel` | `withVercelServerless` + `withVercelEdge` |
| **No framework** | `@flarelog/sdk` | Core `flarelog()` factory + all utilities |

### Common confusion points

- **Next.js on Vercel?** → Use `@flarelog/sdk/next`. It works everywhere Next.js runs; Vercel is just the deployment platform.
- **React on Vercel?** → Use `@flarelog/sdk/react` for the client, `@flarelog/sdk/next` for API routes.
- **Vercel but NOT Next.js?** → Use `@flarelog/sdk/vercel` for plain `api/` routes, Edge Functions, and Middleware.
- **Hono on Cloudflare Workers?** → Use `@flarelog/sdk/hono` for the middleware + `@flarelog/sdk/cf-workers` for the `workerFetch` wrapper.

> **Rule of thumb**: Pick the **framework** integration first. Only reach for the **platform** integration (`cf-workers`, `vercel`) when you don't use a framework or need platform-specific features.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Dashboard Setup](#dashboard-setup)
- [MCP Server](#mcp-server)
- [Configuration](#configuration)
- [Framework Integrations](#framework-integrations)
- [Platform Integrations](#platform-integrations)
- [Other OTel Backends](#other-otel-backends)
- [Fan-out](#fan-out)
- [API Reference](#api-reference)
- [Why Zero Dependencies?](#why-zero-dependencies)
- [Migrating from v1](#migrating-from-v1)
- [Pricing](#pricing)

---

## Installation

```bash
npm install @flarelog/sdk
```

Framework sub-paths are included — no extra installs needed:

```typescript
import { flarelog } from "@flarelog/sdk";            // core
import { expressMiddleware } from "@flarelog/sdk/express";  // framework
import { workerFetch } from "@flarelog/sdk/cf-workers";     // platform
import { withVercelEdge } from "@flarelog/sdk/vercel";      // platform
```

---

## Quick Start

The core `flarelog()` factory works everywhere — Node.js, Vercel, Cloudflare Workers, browsers:

```typescript
import { flarelog } from "@flarelog/sdk";

const logger = flarelog({});
logger.info("Hello!");  // → console (zero config)
```

Add one environment variable to ship to the dashboard:

```bash
FLARELOG_API_KEY=fl_your_key
```

```typescript
const logger = flarelog({});  // auto-detects FLARELOG_API_KEY
```

### Quick examples by stack

**Express:**

```typescript
import { flarelog } from "@flarelog/sdk";
import { expressMiddleware, expressErrorHandler } from "@flarelog/sdk/express";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });
app.use(expressMiddleware(logger));
app.use(expressErrorHandler(logger));
```

**Hono:**

```typescript
import { flarelog } from "@flarelog/sdk";
import { honoMiddleware } from "@flarelog/sdk/hono";

const logger = flarelog({ apiKey: env.FLARELOG_API_KEY });
app.use("*", honoMiddleware(logger));
```

**Next.js API route:**

```typescript
import { flarelog } from "@flarelog/sdk";
import { withFlareLog } from "@flarelog/sdk/next";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withFlareLog(logger, async (req, res) => {
  req.logger.info("Processing request");
  res.json({ data: "Hello" });
});
```

**Cloudflare Workers:**

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

**Vercel Serverless Function:**

```typescript
import { flarelog } from "@flarelog/sdk";
import { withVercelServerless } from "@flarelog/sdk/vercel";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withVercelServerless(logger, async (req, res) => {
  req.logger.info("Processing request");
  res.json({ ok: true });
});
```

**Vercel Edge Function:**

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

## What you get

**[FlareLog dashboard →](https://flarelog.dev)**

- **Error Tracker** — auto-grouped issues with stack traces, first seen / last seen, occurrence count, and one-click silence
- **Cross-boundary traces** — W3C `traceparent` injected on every outbound `fetch()`, so traces survive across services, clouds, and CDN edges
- **Cost Burn Dashboard** _(Pro)_ — CPU time, request volume, and projected spend per service per day
- **90-day retention** _(Pro)_ — for incident retrospectives and compliance
- **Alerts** — Slack or email when a new error fingerprint appears or error rate spikes
- **Log Explorer** — full-text search across all your logs, filter by service / environment / status
- **MCP server** — query production logs in-context from Cursor, Claude Desktop, or Lovable Agent

> Speaks OTLP — also ships to Grafana Cloud, Honeycomb, Datadog, or any OTLP backend. [See fan-out config →](#fan-out)

---

## Dashboard Setup

**[Sign up at flarelog.dev →](https://flarelog.dev)**

Set the API key as an environment variable on your platform:

```bash
# Cloudflare Workers
wrangler secret put FLARELOG_API_KEY

# Vercel
vercel env add FLARELOG_API_KEY

# Node.js / .env
FLARELOG_API_KEY=fl_your_key
```

Then:

```typescript
import { flarelog } from "@flarelog/sdk";
const logger = flarelog({}); // auto-detects FLARELOG_API_KEY
```

Or pass it directly:

```typescript
const logger = flarelog({ apiKey: "fl_your_key" });
```

That's it. Logs, errors, and traces appear in your dashboard on the next request.

---

## MCP Server

FlareLog ships an MCP server so your AI editor can query production logs without leaving the IDE.

### Cursor / Claude Desktop

Add to your `mcp_config.json`:

```json
{
  "mcpServers": {
    "flarelog": {
      "url": "https://mcp.flarelog.dev",
      "headers": {
        "Authorization": "Bearer fl_your_api_key_here"
      }
    }
  }
}
```

### Available tools

| Tool                | What it does                          |
| ------------------- | ------------------------------------- |
| `get_recent_errors` | Fetch latest errors for a service     |
| `search_logs`       | Full-text search across logs          |
| `get_issue`         | Full detail on a specific issue by ID |
| `list_services`     | List all services in your project     |

---

## Configuration

### Environment variables

**Flarelog:**

| Variable            | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `FLARELOG_API_KEY`  | Enables the FlareLog hosted dashboard               |
| `FLARELOG_ENDPOINT` | Override endpoint (default: `https://flarelog.dev`) |

**Platform auto-detection (set automatically, no action needed):**

| Variable                | Platform | Used for                    |
| ----------------------- | -------- | --------------------------- |
| `VERCEL`                | Vercel   | Runtime detection           |
| `VERCEL_ENV`            | Vercel   | `environment` default       |
| `VERCEL_REGION`         | Vercel   | `serverName` default        |
| `VERCEL_GIT_COMMIT_SHA` | Vercel   | `release` default           |
| `CF_PAGES_COMMIT_SHA`   | CF Pages | `release` fallback          |

**Standard OTel env vars (optional):**

| Variable                             | Purpose                                           |
| ------------------------------------ | ------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`        | Ship to any OTLP/HTTP backend                     |
| `OTEL_EXPORTER_OTLP_HEADERS`         | Auth headers, e.g. `Authorization=Basic xxx`      |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`   | Override endpoint for logs only                   |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Override endpoint for traces only                 |
| `OTEL_SERVICE_NAME`                  | `service.name` resource attribute                 |
| `OTEL_RESOURCE_ATTRIBUTES`           | Extra resource attributes (`key=value,key=value`) |

### `flarelog(config?)` factory

All fields are optional — env vars are auto-detected.

```typescript
const logger = flarelog({
  apiKey: "fl_your_key", // or FLARELOG_API_KEY
  otlpEndpoint: "https://...", // or OTEL_EXPORTER_OTLP_ENDPOINT
  serviceName: "my-app", // or OTEL_SERVICE_NAME
  environment: "production",
});
```

---

## Framework Integrations

Framework integrations are **platform-agnostic** — they work regardless of where you deploy.

### Express.js

```typescript
import { flarelog } from "@flarelog/sdk";
import { expressMiddleware, expressErrorHandler } from "@flarelog/sdk/express";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });
app.use(expressMiddleware(logger));
app.use(expressErrorHandler(logger));
```

`expressMiddleware` attaches `req.logger` with request context. `expressErrorHandler` catches errors.

### Hono

```typescript
import { Hono } from "hono";
import { flarelog } from "@flarelog/sdk";
import { honoMiddleware } from "@flarelog/sdk/hono";

const logger = flarelog({});
const app = new Hono();
app.use("*", honoMiddleware(logger));
```

`honoMiddleware` attaches `c.get("logger")` with request context. Works on Cloudflare Workers, Deno, Bun, or Node.js.

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

Works on Vercel, self-hosted, or any Node.js server. Not Cloudflare-specific.

### React

```tsx
import { flarelog } from "@flarelog/sdk";
import { FlareLogErrorBoundary, useFlareLog } from "@flarelog/sdk/react";

const logger = flarelog({ apiKey: process.env.REACT_APP_FLARELOG_API_KEY });

<FlareLogErrorBoundary logger={logger}>
  <App />
</FlareLogErrorBoundary>
```

Runs in the browser. Works with any deployment platform.

### TanStack Start

```typescript
import { flarelog } from "@flarelog/sdk";
import { withFlareLog } from "@flarelog/sdk/tanstack-start";
```

---

## Platform Integrations

Platform integrations provide **runtime-specific** features — OTel span instrumentation, execution context flushing, and environment detection that only make sense on a particular platform.

### Cloudflare Workers

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

const logger = flarelog({ apiKey: env.FLARELOG_API_KEY });

export default {
  fetch: workerFetch(logger, async (request, env, ctx) => {
    logger.info("Request received", { url: request.url });
    return new Response("Hello");
  }),
};
```

`workerFetch()` auto-creates a SERVER span per request: W3C trace context, HTTP semantic attributes, exception recording, and telemetry flush via `ctx.waitUntil()`.

**When to use:** You're writing a Cloudflare Worker directly (not using Hono or another framework on top). If you're using Hono on Workers, use `@flarelog/sdk/hono` instead — it works natively on the Workers runtime.

### Vercel

Vercel has two handlers because the platform runs two different runtimes:

**Serverless Functions** (Node.js runtime, `(req, res)` signature):

```typescript
import { flarelog } from "@flarelog/sdk";
import { withVercelServerless } from "@flarelog/sdk/vercel";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withVercelServerless(logger, async (req, res) => {
  req.logger.info("Processing request");
  res.json({ ok: true });
});
```

**Edge Functions / Middleware** (V8 runtime, Web API `Request`/`Response`):

```typescript
import { flarelog } from "@flarelog/sdk";
import { withVercelEdge } from "@flarelog/sdk/vercel";

export const config = { runtime: "edge" };
const logger = flarelog({});

export default withVercelEdge(logger, async (request) => {
  return new Response("Hello from the edge!");
});
```

**When to use:** You're deploying standalone API routes (`api/`), Edge Functions, or Middleware on Vercel **without Next.js**. If you're using Next.js on Vercel, use `@flarelog/sdk/next` instead.

**Environment auto-detection:** The SDK reads `VERCEL_ENV`, `VERCEL_REGION`, `VERCEL_GIT_COMMIT_SHA`, and other `VERCEL_*` variables automatically.

---

## Other OTel Backends

No FlareLog account needed. Set the endpoint and ship to any OTel-compatible backend.

### Grafana Cloud (free tier)

```bash
# Cloudflare Workers — wrangler.toml
OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp-gateway-prod-eu-west-0.grafana.net"
OTEL_EXPORTER_OTLP_HEADERS  = "Authorization=Basic <base64(instance_id:api_key)>"
OTEL_SERVICE_NAME            = "my-worker"

# Vercel — vercel env add
# Node.js — .env
```

```typescript
const logger = flarelog({}); // auto-detects OTEL_EXPORTER_OTLP_ENDPOINT
```

Same pattern for Honeycomb, Jaeger, Datadog, or any self-hosted collector.

---

## Fan-out

Ship to multiple backends at once:

```typescript
const logger = flarelog({
  transports: [
    { type: "console" },
    { type: "otlp", endpoint: "https://otlp.example.com" },
    { type: "flarelog", apiKey: "fl_your_key" },
  ],
});
```

---

## API Reference

### Logging

```typescript
logger.trace(message, metadata?)
logger.debug(message, metadata?)
logger.info(message, metadata?)
logger.warn(message, metadata?)
logger.error(message, metadata?)
logger.fatal(message, metadata?)

logger.log(level, message, metadata?, opts?)
logger.logError(err, opts?)
await logger.capture(async () => riskyOp(), { label: "Op" })
```

### Spans

```typescript
// Manual span
await logger.startSpan("db-query", async (span) => {
  span.setAttribute("db.system", "postgresql");
  return await db.query(...);
});

// Propagate trace context into outgoing fetches
const headers = new Headers();
logger.injectTraceContext(headers);
await fetch("https://api.example.com/data", { headers });
```

### Advanced: OTel provider access

```typescript
logger.tracerProvider.register(); // register with the global OTel API
logger.tracerProvider.addSpanProcessor(myCustomProcessor);
```

---

## Why Zero Dependencies?

FlareLog implements the parts of OTel that matter — OTLP wire format, W3C trace context, severity numbers, resource attributes — directly in TypeScript. The result:

- **Zero runtime dependencies** — nothing to audit, nothing to conflict
- **No polyfills needed** — works natively on Workers, Vercel Edge, Node.js, and browsers
- **Tiny bundle** — ~9.5 kB gzipped (tracked per release)
- **OTLP-compatible** — ships to Grafana Cloud, Honeycomb, Datadog, or any OTLP/HTTP backend

---

## Migrating from v1

v2 is a breaking change.

| v1                                          | v2                                        |
| ------------------------------------------- | ----------------------------------------- |
| `apiKey` required                           | `apiKey` optional — defaults to console   |
| Custom HTTP format (`/api/trpc/log.ingest`) | OTLP/HTTP JSON (`/v1/logs`, `/v1/traces`) |
| Single backend (Flarelog)                   | Multi-transport fan-out                   |
| Custom trace ID header (`x-trace-id`)       | W3C `traceparent`                         |
| `workerFetch()` emits log messages          | `workerFetch()` emits OTel SERVER spans   |
| No resource attributes                      | `service.name`, `cloud.provider`, etc.    |
| Cloudflare Workers only                     | Vercel, Node.js, browsers too             |

**Steps:**

1. `npm install @flarelog/sdk@^2.0.0`
2. `flarelog()` and `logger.info()` etc. work the same — no changes there
3. If you relied on "Request started/completed" log messages, switch to span-based queries
4. Optionally set `OTEL_EXPORTER_OTLP_ENDPOINT` to ship to any OTel backend
5. Your existing `FLARELOG_API_KEY` still works

---

## Pricing

|                     | Free  | Pro     |
| ------------------- | ----- | ------- |
| Requests/mo         | 10k   | 2M      |
| Log retention       | 7 day | 90 days |
| Error tracking      | ✅    | ✅      |
| Cost Burn Dashboard | —     | ✅      |
| MCP server          | ✅    | ✅      |
| Alerts              | ✅    | ✅      |
| Price               | $0    | $19/mo  |

**[Start free → flarelog.dev](https://flarelog.dev)**

---

## License

MIT