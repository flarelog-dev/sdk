# FlareLog SDK - Quick Start

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
- **Auto-detects release**: from `npm_package_version`, `VERCEL_GIT_COMMIT_SHA`, `CF_PAGES_COMMIT_SHA`, etc.
- **Auto-detects Vercel environment**: `VERCEL_ENV`, `VERCEL_REGION`
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
| `apiKey` | string | required | Your FlareLog API key |
| `endpoint` | string | `https://flarelog.dev/api` | API endpoint |
| `level` | LogLevel | `DEBUG` | Minimum log level |
| `environment` | string | auto-detected | Environment name |
| `release` | string | auto-detected | Release version |
| `serverName` | string | auto-detected | Server identifier |
| `batchSize` | number | `10` (Node), `1` (Worker) | Logs to batch before sending |
| `flushIntervalMs` | number | `5000` (Node), `0` (Worker) | Max time before flushing |
| `maxBatchSize` | number | `100` | Max in-flight buffer size |
| `workerMode` | boolean | `false` | Enable worker-optimized batching |
| `sampleRate` | number | `1.0` | Log sampling rate (0-1) |
| `beforeSend` | function | - | Modify/drop logs before sending |
| `autoCapture` | object | `{console, globalErrors, rejections}` | Auto-capture config |

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

- [Cloudflare Workers Guide](./cloudflare-workers.md) - Workers, Durable Objects, Queues
- [Vercel Guide](./vercel.md) - Serverless Functions, Edge Functions, Middleware
- [Browser Guide](./browser-guide.md) - React, Vue, Next.js, Svelte
- [Node.js Guide](./nodejs-guide.md) - Express, Fastify, NestJS
- [Advanced Features](./advanced-features.md) - Breadcrumbs, tags, beforeSend

## Examples

See the `/examples` directory for complete working examples.
