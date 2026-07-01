# Logging Methods

The FlareLog SDK provides six standard logging levels for different types of events.

## Log Levels

| Level | Description | Use Case |
|---|---|---|
| `TRACE` | Detailed debugging | Internal function calls, variable values |
| `DEBUG` | Development debugging | Development diagnostics, temporary logs |
| `INFO` | General information | Normal operations, milestones |
| `WARN` | Warning events | Recoverable issues, unusual conditions |
| `ERROR` | Error events | Failed operations, exceptions |
| `FATAL` | Critical errors | System crashes, unrecoverable failures |

## Basic Usage

```typescript
import { flarelog } from "@flarelog/sdk";

const logger = flarelog({ apiKey: "fl_your_api_key" });

// Different log levels
logger.trace("Entering function", { args: { userId: "123" } });
logger.debug("Processing request", { body: req.body });
logger.info("User logged in", { userId: "123", method: "oauth" });
logger.warn("Rate limit approaching", { remaining: 10 });
logger.error("Database connection failed", { error: err.message });
logger.fatal("System out of memory", { memory: "heap" });
```

## With Metadata

All logging methods accept an optional metadata object:

```typescript
logger.info("Order created", {
  orderId: "ord_456",
  amount: 99.99,
  currency: "USD",
  items: 3,
});
```

## Log Level Filtering

Set the minimum log level to filter out noise:

```typescript
const logger = flarelog({
  apiKey: "fl_your_api_key",
  level: "INFO", // Only INFO and above
});

logger.debug("This won't be logged"); // Filtered out
logger.info("This will be logged");   // ✅ Logged
```

## Dynamic Log Levels

Use different levels for different environments:

```typescript
const logger = flarelog({
  apiKey: process.env.FLARELOG_API_KEY,
  level: process.env.NODE_ENV === "production" ? "INFO" : "DEBUG",
});
```

## Auto-Generated Timestamps

All logs include timestamps automatically (can be disabled with `includeTimestamps: false`):

```typescript
const logger = flarelog({
  includeTimestamps: true, // Default
});

logger.info("Event");
// Output includes: { timestamp: "2024-01-15T10:30:00.000Z", ... }
```

## Generic `log()` Method

For dynamic log levels, use the generic `log()` method:

```typescript
logger.log("INFO", "User action", { action: "click" });

// With optional overrides for source and tracing
logger.log("ERROR", "Payment failed", { orderId: "ord_123" }, {
  source: "payment-service",
  traceId: "abc-123",
  spanId: "def-456",
});
```

This is what the level-specific helpers (`info()`, `error()`, etc.) call internally.

## `logRaw()` — Full LogEntry

Pass a complete `LogEntry` object when you already have all fields assembled:

```typescript
logger.logRaw({
  level: "WARN",
  message: "Disk usage high",
  source: "monitoring",
  metadata: { usage: 92 },
  traceId: "trace-id-from-upstream",
});
```

## `logError()` — Structured Error Logging

Captures an error with full stack trace serialization, breadcrumbs, and optional metadata:

```typescript
try {
  await processPayment(order);
} catch (err) {
  logger.logError(err, {
    message: "Payment processing failed",  // override the error message
    level: "FATAL",                        // default: "ERROR"
    source: "checkout",
    metadata: { orderId: order.id },
  });
}
```

The error is serialized into structured data including `name`, `message`, `stack`, and a root-cause chain for nested errors.

## `capture()` — Try/Catch Wrapper

Wraps an async function and automatically calls `logError()` on failure:

```typescript
const result = await logger.capture(
  () => riskyOperation(),
  {
    label: "risky-operation",  // logged as "<label> failed"
    level: "ERROR",
    source: "worker",
    metadata: { attempt: 1 },
    rethrow: false,            // default: true
  }
);
// result is undefined if the function threw and rethrow is false
```

