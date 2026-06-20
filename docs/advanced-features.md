# FlareLog SDK - Advanced Features

## Breadcrumbs

Breadcrumbs track events leading up to an error, providing context for debugging.

```typescript
import { FlareLog } from "@flarelog/sdk";

const logger = new FlareLog({
  apiKey: "fl_your_api_key",
});

// Add breadcrumbs manually
logger.addBreadcrumb({
  category: "navigation",
  message: "User navigated to checkout",
  data: { from: "/cart", to: "/checkout" },
});

logger.addBreadcrumb({
  category: "ui.click",
  message: "Clicked pay button",
  data: { button: "pay-now", amount: 99.99 },
});

logger.addBreadcrumb({
  category: "http",
  message: "POST /api/payment",
  data: { status: 200, durationMs: 150 },
});

// When an error occurs, last 50 breadcrumbs are included
logger.logError(new Error("Payment failed"));
// Metadata will include: { breadcrumbs: [...], error: {...} }
```

### Auto-Captured Breadcrumbs

Enable auto-capture in config:

```typescript
const logger = new FlareLog({
  autoCapture: {
    http: true,        // fetch/XHR calls
    navigation: true,  // page navigation
    clicks: true,      // DOM clicks
  },
});
```

## User Context

Identify affected users for faster debugging and support.

```typescript
// Set user on login
logger.setUser({
  id: "user_123",
  email: "user@example.com",
  name: "John Doe",
  plan: "premium", // custom fields
});

// Clear user on logout
logger.setUser(null);

// User context is automatically included in all logs
logger.info("Action performed");
// Metadata: { user: { id: "user_123", email: "user@example.com" } }
```

## Tags

Add searchable tags for filtering and grouping logs.

```typescript
// Set tags
logger.setTag("version", "1.2.3");
logger.setTag("environment", "production");
logger.setTag("feature_flag", "new_checkout");

// Tags are included in all logs
logger.info("Event");
// Metadata: { tags: { version: "1.2.3", environment: "production" } }
```

## BeforeSend Hook

Modify or drop logs before sending. Perfect for PII scrubbing.

```typescript
const logger = new FlareLog({
  beforeSend: (log) => {
    // Scrub sensitive fields
    if (log.metadata?.password) {
      log.metadata.password = "[REDACTED]";
    }
    
    // Add custom metadata
    log.metadata = {
      ...log.metadata,
      appVersion: "1.2.3",
    };
    
    return log;
  },
});

// Drop logs conditionally
const logger = new FlareLog({
  beforeSend: (log) => {
    // Drop health check logs
    if (log.message?.includes("/health")) {
      return false;
    }
    
    // Drop logs below INFO in production
    if (process.env.NODE_ENV === "production" && 
        ["TRACE", "DEBUG"].includes(log.level)) {
      return false;
    }
    
    return log;
  },
});
```

## PII Scrubbing (GDPR Compliance)

Automatically redact sensitive fields from metadata to prevent PII leakage.

```typescript
import { FlareLog } from "@flarelog/sdk";

const logger = new FlareLog({
  apiKey: "fl_your_api_key",
  // Uses default scrub list: password, token, email, name, ssn, etc.
  scrubFields: ["password", "secret", "token", "email"],
});

logger.info("User signed up", {
  email: "user@example.com",  // → "[REDACTED]"
  name: "John",               // → "[REDACTED]"
  userId: "123",              // → "123" (kept)
});
```

**Default scrub fields:** `password`, `secret`, `token`, `apiKey`, `authorization`, `email`, `phone`, `name`, `ssn`, `credit_card`, etc.

## Handling Dropped Logs

Get notified when logs are dropped due to buffer overflow.

```typescript
const logger = new FlareLog({
  apiKey: "fl_your_api_key",
  maxBatchSize: 100,
  onDrop: (droppedCount) => {
    console.warn(`Dropped ${droppedCount} logs`);
    // Increment your monitoring metric here
  },
});
```


## Sample Rate

Control log volume and costs.

```typescript
// Send only 10% of logs
const logger = new FlareLog({
  sampleRate: 0.1,
});

// Send 100% in development, 10% in production
const logger = new FlareLog({
  sampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
```

## Environment Metadata

Automatically track deployment context.

```typescript
const logger = new FlareLog({
  environment: "production",  // or "staging", "development"
  release: "1.2.3",         // or git commit SHA
  serverName: "web-01",     // hostname or instance ID
});

// All logs include:
// { environment: "production", release: "1.2.3", serverName: "web-01" }
```

## Error Cause Chains

Capture nested error context (ES2022+).

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

## Child Loggers

Create scoped loggers with default context.

```typescript
const requestLogger = logger.child({
  source: "api",
  traceId: "abc-123",
  userId: "user_456",
});

requestLogger.info("Request started");
// Source: "api", metadata: { traceId: "abc-123", userId: "user_456" }

requestLogger.error("Database error");
// Inherits all parent context

// Nested children
const dbLogger = requestLogger.child({ source: "database" });
dbLogger.info("Query executed");
// Source: "database", metadata: { traceId: "abc-123", userId: "user_456" }
```

## Capture Patterns

### Async Operations

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

### Sync Operations

```typescript
const result = logger.captureSync(
  () => parseJSON(data),
  { label: "Parse JSON", metadata: { dataLength: data.length } }
);
```

## Request Wrapping

For Cloudflare Workers and similar environments.

```typescript
export default {
  async fetch(request, env, ctx) {
    return logger.withRequest(
      { 
        request, 
        traceId: request.headers.get("x-trace-id") || crypto.randomUUID(),
        metadata: { region: env.CF_REGION }
      },
      ctx,
      async () => {
        // Your handler code
        // All logs include request context
        return new Response("OK");
      }
    );
  }
};
```

## Deduplication

Prevent duplicate error spam.

```typescript
const logger = new FlareLog({
  autoCapture: {
    globalErrors: true,
    dedupWindowMs: 10000, // 10 seconds
  },
});

// Same error within 10 seconds is only logged once
```

## Console Capture

Intercept console methods automatically.

```typescript
const logger = new FlareLog({
  autoCapture: {
    console: true,  // Capture error and warn
    // Or configure specifically:
    console: {
      levels: ["error", "warn", "info"],  // Capture these levels
      source: "app-console",               // Custom source tag
      includeArgs: true,                   // Include console arguments
    }
  }
});

// Now console.error("Something failed") is captured as a log
```

## Manual Flushing

Ensure logs are sent immediately.

```typescript
// Flush all pending logs
await logger.flush();

// In Cloudflare Workers
ctx.waitUntil(logger.flush());

// Before page unload
window.addEventListener("beforeunload", () => {
  logger.flush();
});
```

## Cleanup

Remove event listeners and restore console.

```typescript
// Clean up when shutting down
logger.destroy();

// Or clean up specific handlers
const cleanup = logger.installGlobalHandlers();
// Later...
cleanup();
```

## Complete Configuration Example

```typescript
import { FlareLog } from "@flarelog/sdk";

const logger = new FlareLog({
  // Required
  apiKey: "fl_your_api_key",
  
  // Optional
  endpoint: "https://flarelog.dev/api",
  level: "DEBUG",
  batchSize: 10,
  flushIntervalMs: 5000,
  debug: false,
  defaultSource: "",
  includeTimestamps: true,
  
  // Environment
  environment: "production",
  release: "1.2.3",
  serverName: "web-01",
  
  // Sampling
  sampleRate: 1.0,
  
  // Auto-capture
  autoCapture: {
    console: { levels: ["error", "warn"], source: "console" },
    globalErrors: true,
    rejections: true,
    http: true,
    navigation: true,
    clicks: true,
    dedupWindowMs: 5000,
  },
  
  // Data sanitization
  beforeSend: (log) => {
    // Scrub PII
    if (log.metadata?.password) delete log.metadata.password;
    if (log.metadata?.token) log.metadata.token = "[REDACTED]";
    
    // Add custom fields
    log.metadata = {
      ...log.metadata,
      region: process.env.REGION,
    };
    
    return log;
  },
});
```
