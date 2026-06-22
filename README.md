# @flarelog/sdk

**The observability layer Cloudflare Workers actually needed.**

Drop-in SDK. Three env vars. Your Workers logs, errors, and cost data — live in the [FlareLog dashboard](https://flarelog.dev) in under 5 minutes.

[![npm version](https://img.shields.io/npm/v/@flarelog/sdk)](https://www.npmjs.com/package/@flarelog/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What you get

**[FlareLog dashboard →](https://flarelog.dev)**

- **Log Explorer** — full-text search across all your Workers logs, filter by service / environment / status
- **Error Tracker** — auto-grouped issues with stack traces, first seen / last seen, one-click silence
- **Cost Burn Dashboard** *(Pro)* — CPU time, request volume, and projected spend per Worker per day. Know which Worker is eating your budget before the bill arrives.
- **Alerts** — notify on Slack or email when a new error fingerprint appears or error rate spikes
- **MCP server** — query production logs in-context from Cursor, Claude Desktop, or Lovable Agent

> Built on OpenTelemetry — also ships to Grafana Cloud, Honeycomb, Datadog, or any OTLP backend. [See fan-out config →](#fan-out)

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Dashboard Setup](#dashboard-setup)
- [MCP Server](#mcp-server)
- [Configuration](#configuration)
- [Framework Integrations](#framework-integrations)
- [Other OTel Backends](#other-otel-backends)
- [Fan-out](#fan-out)
- [API Reference](#api-reference)
- [Migrating from v1](#migrating-from-v1)
- [Pricing](#pricing)

---

## Installation

```bash
npm install @flarelog/sdk
```

---

## Quick Start

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

const logger = flarelog({});

export default {
  fetch: workerFetch(logger, async (request, env, ctx) => {
    logger.info("Hello from worker!");
    return new Response("Hello");
  }),
};
```

Zero config → logs to console immediately. Add one secret to ship to the dashboard.

---

## Dashboard Setup

**[Sign up at flarelog.dev →](https://flarelog.dev)**

```bash
wrangler secret put FLARELOG_API_KEY
```

```typescript
const logger = flarelog({}); // auto-detects FLARELOG_API_KEY
```

That's it. Logs, errors, and CPU metrics appear in your dashboard on the next request.

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

| Tool | What it does |
|---|---|
| `get_recent_errors` | Fetch latest errors for a service |
| `search_logs` | Full-text search across logs |
| `get_issue` | Full detail on a specific issue by ID |
| `list_services` | List all Workers in your project |

---

## Configuration

### Flarelog env vars

| Variable | Purpose |
|---|---|
| `FLARELOG_API_KEY` | Enables the FlareLog hosted dashboard |
| `FLARELOG_ENDPOINT` | Override endpoint (default: `https://flarelog.dev`) |

### Standard OTel env vars (optional)

| Variable | Purpose |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Ship to any OTLP/HTTP backend |
| `OTEL_EXPORTER_OTLP_HEADERS` | Auth headers, e.g. `Authorization=Basic xxx` |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | Override endpoint for logs only |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Override endpoint for traces only |
| `OTEL_SERVICE_NAME` | `service.name` resource attribute |
| `OTEL_RESOURCE_ATTRIBUTES` | Extra resource attributes (`key=value,key=value`) |

### `flarelog(config?)` factory

All fields are optional — env vars are auto-detected.

```typescript
const logger = flarelog({
  apiKey: "fl_your_key",       // or FLARELOG_API_KEY
  otlpEndpoint: "https://...", // or OTEL_EXPORTER_OTLP_ENDPOINT
  serviceName: "my-app",       // or OTEL_SERVICE_NAME
  environment: "production",
});
```

---

## Framework Integrations

### Cloudflare Workers (plain fetch)

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

const logger = flarelog({});

export default {
  fetch: workerFetch(logger, async (request, env, ctx) => {
    logger.info("Request received", { url: request.url });
    return new Response("Hello");
  }),
};
```

`workerFetch()` auto-creates a SERVER span per request: W3C trace context, HTTP semantic attributes, exception recording.

### Hono

```typescript
import { Hono } from "hono";
import { flarelog } from "@flarelog/sdk";
import { honoMiddleware } from "@flarelog/sdk/hono";

const logger = flarelog({});
const app = new Hono();
app.use("*", honoMiddleware(logger));
```

### Express.js

```typescript
import { flarelog } from "@flarelog/sdk";
import { expressMiddleware, expressErrorHandler } from "@flarelog/sdk/express";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });
app.use(expressMiddleware(logger));
app.use(expressErrorHandler(logger));
```

See [framework guides](./docs/) for Next.js, React, and TanStack Start.

---

## Other OTel Backends

No FlareLog account needed. Set the endpoint and ship to any OTel-compatible backend.

### Grafana Cloud (free tier)

```toml
# wrangler.toml
[vars]
OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp-gateway-prod-eu-west-0.grafana.net"
OTEL_EXPORTER_OTLP_HEADERS  = "Authorization=Basic <base64(instance_id:api_key)>"
OTEL_SERVICE_NAME            = "my-worker"
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

## Migrating from v1

v2 is a breaking change.

| v1 | v2 |
|---|---|
| `apiKey` required | `apiKey` optional — defaults to console |
| Custom HTTP format (`/api/trpc/log.ingest`) | OTLP/HTTP JSON (`/v1/logs`, `/v1/traces`) |
| Single backend (Flarelog) | Multi-transport fan-out |
| Custom trace ID header (`x-trace-id`) | W3C `traceparent` |
| `workerFetch()` emits log messages | `workerFetch()` emits OTel SERVER spans |
| No resource attributes | `service.name`, `cloud.provider`, etc. |

**Steps:**

1. `npm install @flarelog/sdk@^2.0.0`
2. `flarelog()` and `logger.info()` etc. work the same — no changes there
3. If you relied on "Request started/completed" log messages, switch to span-based queries
4. Optionally set `OTEL_EXPORTER_OTLP_ENDPOINT` to ship to any OTel backend
5. Your existing `FLARELOG_API_KEY` still works

---

## Pricing

| | Free | Pro |
|---|---|---|
| Requests/day | 100k | Unlimited |
| Log retention | 1 day | 7 days |
| Error tracking | ✅ | ✅ |
| Cost Burn Dashboard | — | ✅ |
| MCP server | ✅ | ✅ |
| Alerts | Email | Email + Slack + Webhook |
| Price | $0 | $19/mo |

**[Start free → flarelog.dev](https://flarelog.dev)**

---

## License

MIT