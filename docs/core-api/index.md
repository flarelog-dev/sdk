# Core API Reference

Complete reference for the FlareLog SDK core API.

## Overview

The FlareLog SDK provides a zero-dependency observability client that ships logs, errors, and traces to FlareLog or any OTLP-compatible backend.

## Key Components

- **[FlareLog Class](flarelog-class.md)** — Main logger class with all logging methods
- **[FlareLogChild Class](flarelog-child.md)** — Child loggers for scoped contexts
- **[Configuration](configuration.md)** — Full configuration options via `FlareLogConfig`
- **[Logging Methods](logging-methods.md)** — trace, debug, info, warn, error, fatal
- **[Error Handling](error-handling.md)** — logError, capture, captureSync
- **[Transports](transports.md)** — Console, FlareLog, and OTLP transports

## Quick Example

```typescript
import { flarelog } from "@flarelog/sdk";

const logger = flarelog({
  apiKey: "fl_your_api_key",
  // Everything else is auto-detected!
});

logger.info("Application started");
logger.error("Something went wrong", { error: "details" });
```

## Auto-Detection

The `flarelog()` factory automatically detects:

- **Environment**: `development`, `production`, etc. (reads `VERCEL_ENV`, `NODE_ENV`, CF env)
- **Release**: from `npm_package_version`, `VERCEL_GIT_COMMIT_SHA`, `CF_PAGES_COMMIT_SHA`
- **Server name**: hostname or `VERCEL_REGION`
- **Platform**: Cloudflare Workers, Vercel, Node.js, browser — adjusts batching and flushing
- **Auto-capture**: console, globalErrors, rejections

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
