# @flarelog/sdk

Zero-config logging SDK for Cloudflare Workers, Node.js, and any JavaScript runtime with `fetch` support. Send structured logs to FlareLog with minimal setup and excellent developer experience.

## Features

- **Cloudflare Workers first** — Works seamlessly in edge environments
- **Zero config** — Just an API key and project name
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

## Quick Start

```typescript
import { FlareLog } from "@flarelog/sdk";

const logger = new FlareLog({
  apiKey: "lf_your_api_key_here",
  project: "my-cloudflare-worker",
});

logger.info("Server started", { port: 8787 });
logger.warn("High latency detected", { durationMs: 2500, route: "/api/users" });
logger.error("Database connection failed", { error: err.message });
```

## Cloudflare Workers Example

```typescript
import { FlareLog } from "@flarelog/sdk";

const logger = new FlareLog({
  apiKey: "lf_your_api_key_here",
  project: "my-worker",
  level: "INFO",           // Only send INFO and above
  batchSize: 5,            // Send every 5 logs
  flushIntervalMs: 3000,   // Or every 3 seconds
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    logger.info("Request received", {
      method: request.method,
      url: request.url,
    });

    try {
      const response = await handleRequest(request);
      logger.info("Request completed", { status: response.status });
      return response;
    } catch (err) {
      logger.error("Request failed", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      throw err;
    } finally {
      // Ensure logs are sent before the worker exits
      ctx.waitUntil(logger.flush());
    }
  },
};
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | **required** | Your FlareLog API key |
| `project` | `string` | **required** | Project slug to send logs to |
| `endpoint` | `string` | `https://flarelog.dev/api` | FlareLog API endpoint |
| `level` | `LogLevel` | `"DEBUG"` | Minimum log level to send |
| `batchSize` | `number` | `10` | Logs to batch before sending |
| `flushIntervalMs` | `number` | `5000` | Max time before flushing |
| `debug` | `boolean` | `false` | Enable SDK debug logging |
| `defaultSource` | `string` | `""` | Default source tag for logs |

## Log Levels

Levels in order of severity (least to most):

```
TRACE < DEBUG < INFO < WARN < ERROR < FATAL
```

Set `level` in config to filter which logs are sent. For example, `level: "WARN"` will only send WARN, ERROR, and FATAL logs.

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
// Flush before worker exits
ctx.waitUntil(logger.flush());

// Or in Node.js before shutdown
process.on("beforeExit", async () => {
  await logger.flush();
});
```

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

## License

MIT
