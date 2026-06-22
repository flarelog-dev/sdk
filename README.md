# @flarelog/sdk

**The OpenTelemetry-native SDK for Cloudflare Workers, Node.js, and browsers.**

Ship logs and traces to **any** OTel backend — Grafana Cloud, Honeycomb, Tempo, Jaeger, Datadog, or Flarelog's hosted dashboard. No API key required to get started.



## Why v2?

| Scenario | What happens |
|----------|--------------|
| **Dev testing locally** | SDK works out of the box. Logs + traces pretty-print to console. Zero friction, zero config. |
| **Small project, no budget** | SDK works. Point it at free Grafana Cloud or self-hosted Tempo via one env var. You still own the instrumentation standard. |
| **Team scales up** | They already use your SDK. Switching to Flarelog hosted = set `FLARELOG_API_KEY`. One env var, zero code changes. |
| **Enterprise wants self-host** | They pay for on-prem license or support. The SDK is already OTLP-compatible — no vendor lock-in. |

## Installation

```bash
npm install @flarelog/sdk
```

## Quick Start

### Zero config — console output (dev mode)

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

const logger = flarelog({});  // no API key, no OTLP endpoint → console

export default {
  fetch: workerFetch(logger, async (request, env, ctx) => {
    logger.info("Hello from worker!");  // pretty-prints to console
    return new Response("Hello");
  }),
};
```

### Grafana Cloud free tier — no Flarelog API key needed

```toml
# wrangler.toml
[vars]
OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp-gateway-prod-eu-west-0.grafana.net"
OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Basic <base64(instance_id:api_key)>"
OTEL_SERVICE_NAME = "my-worker"
```

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

const logger = flarelog({});  // auto-detects OTEL_EXPORTER_OTLP_ENDPOINT

export default {
  fetch: workerFetch(logger, async (request, env, ctx) => {
    logger.info("Hello Grafana!");  // ships to Grafana Cloud via OTLP
    return new Response("Hello");
  }),
};
```

### Flarelog hosted backend

```bash
wrangler secret put FLARELOG_API_KEY
```

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

const logger = flarelog({});  // auto-detects FLARELOG_API_KEY

export default {
  fetch: workerFetch(logger, async (request, env, ctx) => {
    logger.info("Hello Flarelog!");  // ships to flarelog.dev dashboard
    return new Response("Hello");
  }),
};
```

### Fan-out — console + Grafana + Flarelog simultaneously

```typescript
import { flarelog } from "@flarelog/sdk";

const logger = flarelog({
  apiKey: env.FLARELOG_API_KEY,        // → Flarelog dashboard
  otlpEndpoint: env.OTLP_ENDPOINT,      // → Grafana Cloud
  transports: [{ type: "console" }],    // → console (dev visibility)
});
```

## What's new in v2

### OpenTelemetry-native

- **Logs and traces** emitted via standard OTel API (`@opentelemetry/api`, `@opentelemetry/api-logs`)
- **OTLP/HTTP JSON** wire format — works with any OTel-compatible backend
- **W3C trace context** propagation (`traceparent` header) across service bindings
- **Log-to-trace correlation** — logs emitted inside a span automatically carry `traceId` + `spanId`
- **Resource attributes** — `service.name`, `service.version`, `deployment.environment.name`, `cloud.provider=cloudflare`, etc.
- **Semantic conventions** — `http.request.method`, `url.path`, `http.response.status_code`, etc.

### Optional API key

The `apiKey` field is now **optional**. With no API key and no OTLP endpoint, the SDK defaults to console output. This makes the SDK useful out-of-the-box with zero backend setup.

### Multi-transport fan-out

Ship telemetry to multiple backends simultaneously:

```typescript
const logger = flarelog({
  transports: [
    { type: "console" },                                          // dev visibility
    { type: "otlp", endpoint: "https://otlp.example.com" },       // Grafana
    { type: "flarelog", apiKey: "fl_your_key" },                  // Flarelog
  ],
});
```

### Auto-instrumented spans

`workerFetch()` now creates an OTel **SERVER span** for every request:

- Span name: `GET /api/users` (method + path)
- Attributes: `http.request.method`, `url.path`, `url.full`, `http.response.status_code`, `flarelog.duration_ms`
- W3C `traceparent` extracted from incoming headers (or new trace started)
- Exceptions recorded on the span with `span.recordException()`
- Span status set to `ERROR` for 5xx responses and thrown exceptions

### Env-var-based configuration

All standard OTEL_* env vars are respected:

| Env var | Purpose |
|---------|---------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP endpoint base URL |
| `OTEL_EXPORTER_OTLP_HEADERS` | Headers (e.g. `Authorization=Basic xxx`) |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | Override endpoint for logs only |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Override endpoint for traces only |
| `OTEL_SERVICE_NAME` | `service.name` resource attribute |
| `OTEL_RESOURCE_ATTRIBUTES` | Extra resource attributes (key=value,key=value) |

Plus Flarelog-specific vars:

| Env var | Purpose |
|---------|---------|
| `FLARELOG_API_KEY` | Enables Flarelog hosted backend |
| `FLARELOG_ENDPOINT` | Override Flarelog endpoint (default: https://flarelog.dev) |

## API Reference

### `flarelog(config?)`

Factory function with auto-detection. Returns a `FlareLog` instance.

```typescript
const logger = flarelog({
  apiKey: "fl_your_key",        // optional
  otlpEndpoint: "https://...",   // optional
  serviceName: "my-app",         // optional
  environment: "production",     // optional
  // ... all other options
});
```

### Logging methods (v1 API — preserved)

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

### Span methods (new in v2)

```typescript
// Manual span creation
await logger.startSpan("db-query", async (span) => {
  span.setAttribute("db.system", "postgresql");
  span.setAttribute("db.statement", "SELECT * FROM users");
  const result = await db.query(...);
  return result;
});

// Request-scoped span (used internally by workerFetch)
await logger.withRequest({ request }, ctx, async () => {
  // your handler — all logs here carry the span's traceId
  logger.info("processing");
  return new Response("ok");
});

// Inject trace context into outgoing fetch calls
const headers = new Headers();
logger.injectTraceContext(headers);
await fetch("https://api.example.com/data", { headers });
```

### Transport configuration

```typescript
flarelog({
  transports: [
    { type: "console" },
    {
      type: "otlp",
      endpoint: "https://otlp.example.com",
      headers: { Authorization: "Basic xxx" },
      enableLogs: true,
      enableTraces: true,
    },
    {
      type: "flarelog",
      apiKey: "fl_your_key",
      endpoint: "https://flarelog.dev",  // optional
      enableTraces: true,
    },
  ],
});
```

### OTel provider access (advanced)

Each `FlareLog` instance owns its own `TracerProvider` and `LoggerProvider`. You can access them to integrate with other OTel libraries:

```typescript
const logger = flarelog({ apiKey: "fl_your_key" });

// Register with the global OTel API (so other OTel libs use this provider)
logger.tracerProvider.register();

// Add custom span processors
logger.tracerProvider.addSpanProcessor(myCustomProcessor);
```

## Framework Integrations

### Cloudflare Workers

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

const logger = flarelog({});

export default {
  fetch: workerFetch(logger, async (request, env, ctx) => {
    // Every request gets a SERVER span with W3C trace context
    logger.info("Request received", { url: request.url });
    return new Response("Hello");
  }),
};
```

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
import { Hono } from "hono";
import { flarelog } from "@flarelog/sdk";
import { honoMiddleware } from "@flarelog/sdk/hono";

const logger = flarelog({});
const app = new Hono();
app.use("*", honoMiddleware(logger));
```

### Next.js / React / TanStack Start

See the [framework guides](./docs/) for detailed integration instructions.

## Migration from v1

v2 is a breaking change. Key differences:

| v1 | v2 |
|----|-----|
| `apiKey` required | `apiKey` optional (defaults to console) |
| Custom HTTP format (`/api/trpc/log.ingest`) | OTLP/HTTP JSON (`/api/v1/logs`, `/api/v1/traces`) |
| Single backend (Flarelog) | Multi-transport fan-out (console + OTLP + Flarelog) |
| Custom trace ID header (`x-trace-id`) | W3C `traceparent` standard |
| `workerFetch()` emits "Request started/completed" logs | `workerFetch()` emits OTel SERVER spans |
| No resource attributes | `service.name`, `cloud.provider`, etc. |

**To migrate:**
1. Update to `@flarelog/sdk@^2.0.0`
2. The `flarelog()` factory and `logger.info()` etc. still work the same
3. If you relied on "Request started/completed" log messages, switch to span-based queries
4. Set `OTEL_EXPORTER_OTLP_ENDPOINT` to ship to any OTel backend (optional)
5. Your existing `FLARELOG_API_KEY` still works — it enables the Flarelog transport

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │           FlareLog SDK v2            │
                    │  (OpenTelemetry-native, MIT, free)   │
                    └─────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
            │   Console    │  │     OTLP     │  │   Flarelog   │
            │  (dev mode)  │  │  (any OTel   │  │  (gated,     │
            │              │  │   backend)   │  │   paid)      │
            └──────────────┘  └──────────────┘  └──────────────┘
                                      │                 │
                                      ▼                 ▼
                              ┌──────────────┐  ┌──────────────┐
                              │     Grafana  │  │   Flarelog   │
                              │    Honeycomb │  │  Dashboard   │
                              │      Tempo   │  │  + AI analysis│
                              │     Jaeger   │  │  + Long-term  │
                              │    Datadog   │  │    storage    │
                              │  Self-hosted │  │               │
                              │   Collector  │  │               │
                              └──────────────┘  └──────────────┘
```

## License

MIT
