# FlareLog SDK - Quick Start

## Installation

```bash
npm install @flarelog/sdk
```

## Basic Usage

### Browser

```typescript
import { FlareLog } from "@flarelog/sdk";

const logger = new FlareLog({
  apiKey: "fl_your_api_key",
  project: "my-website",
  environment: "production",
  autoCapture: {
    console: true,
    globalErrors: true,
    rejections: true,
  },
});

logger.info("Page loaded", { url: window.location.href });
```

### Node.js

```typescript
import { FlareLog } from "@flarelog/sdk";

const logger = new FlareLog({
  apiKey: "fl_your_api_key",
  project: "my-api",
  environment: process.env.NODE_ENV,
  autoCapture: {
    console: true,
    globalErrors: true,
  },
});

logger.info("Server started", { port: 3000 });
```

### Cloudflare Workers

```typescript
import { FlareLog } from "@flarelog/sdk";

const logger = new FlareLog({
  apiKey: "fl_your_api_key",
  project: "my-worker",
  environment: "production",
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return logger.withRequest(
      { request, traceId: crypto.randomUUID() },
      ctx,
      async () => {
        logger.info("Request received", { url: request.url });
        return new Response("Hello");
      }
    );
  },
};
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | string | required | Your FlareLog API key |
| `project` | string | required | Project identifier |
| `endpoint` | string | `https://flarelog.dev/api` | API endpoint |
| `level` | LogLevel | `DEBUG` | Minimum log level |
| `environment` | string | `development` | Environment name |
| `release` | string | - | Release version |
| `serverName` | string | - | Server identifier |
| `sampleRate` | number | `1.0` | Log sampling rate (0-1) |
| `beforeSend` | function | - | Modify/drop logs before sending |
| `autoCapture` | object | - | Automatic error capture config |

## Log Levels

- `TRACE` - Detailed debugging
- `DEBUG` - Development debugging
- `INFO` - General information
- `WARN` - Warning events
- `ERROR` - Error events
- `FATAL` - Critical errors

## Methods

### Logging

```typescript
logger.trace(message, metadata?)
logger.debug(message, metadata?)
logger.info(message, metadata?)
logger.warn(message, metadata?)
logger.error(message, metadata?)
logger.fatal(message, metadata?)
```

### Error Handling

```typescript
// Log error with context
logger.logError(error, { message, metadata, source })

// Capture async function errors
await logger.capture(() => riskyOperation(), { label: "Operation" })

// Capture sync function errors
logger.captureSync(() => riskyOperation(), { label: "Operation" })
```

### Context

```typescript
// Set user context
logger.setUser({ id: "123", email: "user@example.com" })

// Add tags
logger.setTag("version", "1.2.3")

// Add breadcrumbs
logger.addBreadcrumb({ category: "navigation", message: "Page loaded" })

// Create child logger
const child = logger.child({ source: "database", traceId: "abc-123" })
```

### Control

```typescript
// Flush logs immediately
await logger.flush()

// Clean up resources
logger.destroy()
```

## Auto Capture

```typescript
const logger = new FlareLog({
  autoCapture: {
    console: true,        // Capture console.error/warn
    globalErrors: true,   // Capture window.onerror
    rejections: true,     // Capture unhandled rejections
    http: true,           // Capture fetch/XHR as breadcrumbs
    navigation: true,     // Capture page navigation
    clicks: true,         // Capture DOM clicks
  },
});
```

## Guides

- [Cloudflare Workers Guide](./cloudflare-workers.md) - Workers, Durable Objects, Queues
- [Browser Guide](./browser-guide.md) - React, Vue, Next.js, Svelte
- [Node.js Guide](./nodejs-guide.md) - Express, Fastify, NestJS
- [Advanced Features](./advanced-features.md) - Breadcrumbs, tags, beforeSend

## Examples

See the `/examples` directory for complete working examples.
