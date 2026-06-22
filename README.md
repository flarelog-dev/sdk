# @flarelog/sdk

**OpenTelemetry-native observability for Cloudflare Workers, Node.js, and browsers.**

Ship logs and traces to any OTel backend — Grafana Cloud, Honeycomb, Tempo, Jaeger, Datadog — or use the Flarelog hosted dashboard. No API key required to get started.

---

## TL;DR

```bash
npm install @flarelog/sdk
```

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

const logger = flarelog({}); // no config → pretty-prints to console

export default {
  fetch: workerFetch(logger, async (request, env, ctx) => {
    logger.info("Hello from worker!");
    return new Response("Hello");
  }),
};
```

- **Zero config** → logs to console, works immediately
- **One env var** (`OTEL_EXPORTER_OTLP_ENDPOINT`) → ships to Grafana Cloud, Honeycomb, or any OTel backend
- **One secret** (`FLARELOG_API_KEY`) → ships to the Flarelog hosted dashboard
- **Fan-out** → console + OTLP + Flarelog simultaneously

---

## Do I need the full Flarelog platform?

| I want to… | What to do |
|---|---|
| Try it locally with zero setup | `flarelog({})` — console output, no config needed |
| Ship to Grafana Cloud / Honeycomb / self-hosted OTel | Set `OTEL_EXPORTER_OTLP_ENDPOINT` — no API key required |
| Get a hosted dashboard with AI analysis and long-term storage | Sign up at [flarelog.dev](https://flarelog.dev) and set `FLARELOG_API_KEY` |
| Do all three at once | [Fan-out transport config](#fan-out) |

---

## Installation

```bash
npm install @flarelog/sdk
```

---

## Quick start

### Console output (dev, zero config)

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

### Grafana Cloud free tier — no Flarelog account needed

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

### Flarelog hosted dashboard

```bash
wrangler secret put FLARELOG_API_KEY
```

```typescript
const logger = flarelog({}); // auto-detects FLARELOG_API_KEY
```

### Fan-out

Ship to multiple backends simultaneously:

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

## What's in v2

| Feature | Detail |
|---|---|
| OTel logs + traces | Standard `@opentelemetry/api` — works with any OTel-compatible backend |
| OTLP/HTTP JSON wire format | `/v1/logs`, `/v1/traces` — no proprietary endpoints |
| W3C trace context | `traceparent` propagation across service bindings |
| Log-to-trace correlation | Logs inside a span automatically carry `traceId` + `spanId` |
| Resource attributes | `service.name`, `cloud.provider=cloudflare`, semantic HTTP conventions |
| Optional API key | Defaults to console with zero config |
| Multi-transport fan-out | Console + OTLP + Flarelog simultaneously |
| Auto-instrumented spans | `workerFetch()` creates a SERVER span per request with method, path, status code, duration |

---

## Configuration

### Environment variables

All standard OTel env vars are supported:

| Variable | Purpose |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP base URL |
| `OTEL_EXPORTER_OTLP_HEADERS` | Headers, e.g. `Authorization=Basic xxx` |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | Override endpoint for logs only |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Override endpoint for traces only |
| `OTEL_SERVICE_NAME` | `service.name` resource attribute |
| `OTEL_RESOURCE_ATTRIBUTES` | Extra resource attributes (`key=value,key=value`) |

Flarelog-specific:

| Variable | Purpose |
|---|---|
| `FLARELOG_API_KEY` | Enables Flarelog hosted backend |
| `FLARELOG_ENDPOINT` | Override Flarelog endpoint (default: `https://flarelog.dev`) |

### `flarelog(config?)` factory

```typescript
const logger = flarelog({
  apiKey: "fl_your_key",      // optional
  otlpEndpoint: "https://...", // optional
  serviceName: "my-app",       // optional
  environment: "production",   // optional
});
```

All fields are optional. Auto-detection reads env vars first.

---

## API reference

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
  const result = await db.query(...);
  return result;
});

// Propagate trace context into outgoing fetch calls
const headers = new Headers();
logger.injectTraceContext(headers);
await fetch("https://api.example.com/data", { headers });
```

### Advanced: OTel provider access

```typescript
// Register with the global OTel API (so other OTel libs use this provider)
logger.tracerProvider.register();

// Add custom span processors
logger.tracerProvider.addSpanProcessor(myCustomProcessor);
```

---

## Framework integrations

### Cloudflare Workers

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

`workerFetch()` automatically creates a SERVER span per request with W3C trace context, HTTP semantic attributes, and exception recording.

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

### Next.js / React / TanStack Start

See the [framework guides](./docs/).

---

## Migrating from v1

v2 is a breaking change. Key differences:

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
2. `flarelog()` factory and `logger.info()` etc. work the same — no changes there
3. If you relied on "Request started/completed" log messages, switch to span-based queries
4. Set `OTEL_EXPORTER_OTLP_ENDPOINT` to ship to any OTel backend (optional)
5. Your existing `FLARELOG_API_KEY` still works

---

## License

MIT