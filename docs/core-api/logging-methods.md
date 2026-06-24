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
