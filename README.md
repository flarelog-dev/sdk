# @flarelog/sdk

Zero-config logging SDK for Cloudflare Workers, Node.js, and any JavaScript runtime with `fetch` support. Send structured logs to FlareLog with minimal setup and excellent developer experience.

## Features

- **Cloudflare Workers first** — Works seamlessly in edge environments
- **Zero config** — Just an API key
- **Auto-detection** — Environment, release, and server name detected automatically
- **Framework integrations** — Express, Hono, Next.js, React, TanStack Start, and more
- **Structured logging** — Attach metadata to every log entry
- **Automatic batching** — Efficient log transmission with configurable batch size
- **Log levels** — TRACE, DEBUG, INFO, WARN, ERROR, FATAL with level filtering
- **Child loggers** — Create contextual loggers with default metadata
- **TypeScript** — Full type safety out of the box
- **Tiny bundle** — Minimal footprint for edge environments

## Installation

```bash
npm install @flarelog/sdk
```

## Quick Start (3 lines)

### Cloudflare Workers

```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

const logger = flarelog({ apiKey: env.FLARELOG_API_KEY, });

export default {
  fetch: workerFetch(logger, async (request, env, ctx) => {
    logger.info("Hello from worker!");
    return new Response("Hello");
  }),
};
```

### Express.js

```typescript
import { flarelog } from "@flarelog/sdk";
import { expressMiddleware, expressErrorHandler } from "@flarelog/sdk/express";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY, });

app.use(expressMiddleware(logger));
app.use(expressErrorHandler(logger));
```

### Hono

```typescript
import { flarelog } from "@flarelog/sdk";
import { honoMiddleware } from "@flarelog/sdk/hono";

const logger = flarelog({ apiKey: env.FLARELOG_API_KEY, });

app.use("*", honoMiddleware(logger));
```

### Next.js

```typescript
import { flarelog } from "@flarelog/sdk";
import { withFlareLog } from "@flarelog/sdk/next";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY, });

export default withFlareLog(logger, async (req, res) => {
  req.logger.info("Processing request");
  res.json({ data: "Hello" });
});
```

### React

```tsx
import { flarelog } from "@flarelog/sdk";
import { FlareLogErrorBoundary, useFlareLog } from "@flarelog/sdk/react";

const logger = flarelog({ apiKey: process.env.REACT_APP_FLARELOG_API_KEY, });

// Error Boundary
<FlareLogErrorBoundary logger={logger}>
  <App />
</FlareLogErrorBoundary>

// Hook
const { trackEvent } = useFlareLog(logger);
trackEvent("button_clicked", { button: "checkout" });
```

## The `flarelog()` Factory

The `flarelog()` function is a branded factory that creates a `FlareLog` instance with sensible defaults:

- **Auto-detects environment**: `development`, `production`, etc.
- **Auto-detects release**: from `npm_package_version`, `VERCEL_GIT_COMMIT_SHA`, etc.
- **Auto-detects server name**: hostname
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
| `apiKey` | `string` | **required** | Your FlareLog API key |
| `endpoint` | `string` | `https://flarelog.dev/api` | FlareLog API endpoint |
| `level` | `LogLevel` | `"DEBUG"` | Minimum log level to send |
| `environment` | `string` | auto-detected | Environment name |
| `release` | `string` | auto-detected | Release version |
| `serverName` | `string` | auto-detected | Server identifier |
| `batchSize` | `number` | `10` (Node), `1` (Worker) | Logs to batch before sending |
| `flushIntervalMs` | `number` | `5000` (Node), `0` (Worker) | Max time before flushing |
| `maxBatchSize` | `number` | `100` | Max in-flight buffer size |
| `workerMode` | `boolean` | `false` | Enable worker-optimized batching |
| `debug` | `boolean` | `false` | Enable SDK debug logging |
| `defaultSource` | `string` | `""` | Default source tag for logs |
| `sampleRate` | `number` | `1.0` | Log sampling rate (0-1) |
| `beforeSend` | `function` | - | Modify/drop logs before sending |
| `autoCapture` | `object` | `{console, globalErrors, rejections}` | Auto-capture config |

## Log Levels

Levels in order of severity (least to most):

```
TRACE < DEBUG < INFO < WARN < ERROR < FATAL
```

Set `level` in config to filter which logs are sent. For example, `level: "WARN"` will only send WARN, ERROR, and FATAL logs.

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

## Child Loggers

Create contextual loggers that carry default metadata:

```typescript
const requestLogger = logger.child({
  source: "request-handler",
  requestId: crypto.randomUUID(),
});

requestLogger.info("Processing payment"); // Includes requestId automatically
requestLogger.error("Payment failed", { reason: "insufficient_funds" });
```

## Manual Flush

Logs are batched automatically, but you can force a flush:

```typescript
// Flush before worker exits (automatic in workerFetch, but available for manual use)
ctx.waitUntil(logger.flush());

// Or in Node.js before shutdown
process.on("beforeExit", async () => {
  await logger.flush();
});
```

**Note for Workers**: When using `workerFetch()` or `withRequest()`, flushing is handled automatically. The SDK flushes logs at each await boundary and guarantees delivery via `ctx.waitUntil()` on completion. If `ctx.waitUntil` is not available (e.g., in tests), the SDK falls back to a blocking flush.

## Advanced: Raw Log Entries

For full control over the log entry:

```typescript
logger.logRaw({
  level: "ERROR",
  message: "Something went wrong",
  source: "payment-service",
  metadata: { orderId: "12345" },
  traceId: "abc123",
  spanId: "def456",
});
```

## Documentation

- [Cloudflare Workers Guide](./docs/cloudflare-workers.md) - Workers, Durable Objects, Queues, R2, KV
- [Browser Guide](./docs/browser-guide.md) - React, Vue, Next.js, Svelte, Web Vitals
- [Node.js Guide](./docs/nodejs-guide.md) - Express, Fastify, NestJS, Koa
- [TanStack Start Guide](./docs/tanstack-start.md) - TanStack Start middleware and API routes
- [Advanced Features](./docs/advanced-features.md) - Breadcrumbs, tags, beforeSend, sampleRate

## License

MIT
