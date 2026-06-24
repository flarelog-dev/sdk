# Error Handling

FlareLog provides multiple ways to capture and report errors.

## logError

The primary method for structured error reporting:

```typescript
import { flarelog } from "@flarelog/sdk";

const logger = flarelog({ apiKey: "fl_your_api_key" });

try {
  await riskyOperation();
} catch (err) {
  logger.logError(err, {
    message: "Operation failed",
    metadata: { operation: "payment", userId: "123" },
  });
}
```

### Options

```typescript
logger.logError(error, {
  message?: string,           // Custom error message
  level?: LogLevel,           // Override log level (default: ERROR)
  source?: string,           // Error source tag
  metadata?: Record<string, unknown>, // Additional context
  traceId?: string,          // Trace ID for correlation
});
```

## capture

Wrap async operations with automatic error capture:

```typescript
// Capture errors and rethrow (default)
const result = await logger.capture(
  () => fetchUserData(userId),
  { label: "Fetch user", metadata: { userId } }
);

// Capture without rethrowing
const result = await logger.capture(
  () => fetchUserData(userId),
  { rethrow: false, label: "Fetch user" }
);
// Returns undefined on error instead of throwing

// Capture with custom level
await logger.capture(
  () => riskyOperation(),
  { level: "WARN", label: "Risky operation" }
);
```

## captureSync

For synchronous operations:

```typescript
const result = logger.captureSync(
  () => parseJSON(data),
  { label: "Parse JSON", metadata: { dataLength: data.length } }
);
```

## Error Cause Chains

Capture nested error context (ES2022+):

```typescript
const rootError = new Error("Database connection failed");
const apiError = new Error("API request failed", { cause: rootError });
const userError = new Error("Unable to load profile", { cause: apiError });

logger.logError(userError);
// Metadata includes full cause chain:
// {
//   error: {
//     message: "Unable to load profile",
//     cause: {
//       message: "API request failed",
//       cause: {
//         message: "Database connection failed"
//       }
//     }
//   }
// }
```

## Deduplication

Prevent duplicate error spam:

```typescript
const logger = flarelog({
  autoCapture: {
    globalErrors: true,
    dedupWindowMs: 10000, // 10 seconds
  },
});

// Same error within 10 seconds is only logged once
```

## Auto-Capture

Enable automatic error capture:

```typescript
const logger = flarelog({
  autoCapture: {
    globalErrors: true,   // window.onerror / process.on('uncaughtException')
    rejections: true,     // unhandled promise rejections
  },
});
```

## Console Capture

Intercept console errors automatically:

```typescript
const logger = flarelog({
  autoCapture: {
    console: {
      levels: ["error", "warn"],
      source: "app-console",
    },
  },
});

// Now console.error("Something failed") is captured as a log
```
