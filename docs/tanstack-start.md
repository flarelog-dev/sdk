# FlareLog SDK - TanStack Start Guide

Zero-config logging for TanStack Start applications. Automatically capture request logs, errors, and performance metrics with trace IDs.

## Quick Start (3 lines)

```typescript
import { flarelog } from "@flarelog/sdk";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

// In your TanStack Start app configuration
app.use(tanstackStartMiddleware(logger));
```

The `flarelog()` factory auto-detects environment, release, and serverName.

## Installation

```bash
npm install @flarelog/sdk
```

## Middleware Setup

### Basic Middleware

```typescript
import { flarelog } from "@flarelog/sdk";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

// Register middleware in your TanStack Start app
export default createApp({
  middleware: [tanstackStartMiddleware(logger)],
});
```

### Using the Logger in Routes

```typescript
import { createRoute } from "@tanstack/start";

export const Route = createRoute({
  path: "/api/users/$id",
  loader: async ({ params, context }) => {
    // Access the logger from context
    const logger = context.get("logger");
    
    logger.info("Fetching user", { userId: params.id });
    
    const user = await db.users.findById(params.id);
    
    if (!user) {
      logger.warn("User not found", { userId: params.id });
      throw new Error("User not found");
    }
    
    logger.info("User fetched", { userId: user.id });
    return { user };
  },
});
```

### API Routes with Wrapper

```typescript
import { flarelog } from "@flarelog/sdk";
import { withTanStackStart } from "@flarelog/sdk/tanstack-start";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default withTanStackStart(logger, async (ctx) => {
  const logger = ctx.get("logger");
  
  logger.info("Processing API request");
  
  try {
    const data = await fetchData();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    logger.logError(err, { message: "API request failed" });
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
    });
  }
});
```

## What Gets Logged Automatically

### Request Completion

Every request is logged with:
- **Trace ID**: From `x-trace-id` header or auto-generated UUID
- **Method**: HTTP method (GET, POST, etc.)
- **Path**: Request URL path
- **Status**: HTTP status code
- **Duration**: Request duration in milliseconds
- **IP**: Client IP address (if available)

### Log Levels by Status Code

| Status Range | Log Level |
|-------------|-----------|
| 2xx-3xx | INFO |
| 4xx | WARN |
| 5xx | ERROR |

### Error Capture

Unhandled errors are automatically captured with:
- Full error stack trace
- Request context (method, path, traceId)
- Duration at point of failure

## Child Loggers

Create contextual loggers for specific operations:

```typescript
export const Route = createRoute({
  path: "/api/orders",
  loader: async ({ context }) => {
    const logger = context.get("logger");
    
    // Create a child logger for order processing
    const orderLogger = logger.child({
      source: "order-service",
      operation: "create-order",
    });
    
    orderLogger.info("Creating order");
    
    try {
      const order = await createOrder();
      orderLogger.info("Order created", { orderId: order.id });
      return { order };
    } catch (err) {
      orderLogger.logError(err, { message: "Order creation failed" });
      throw err;
    }
  },
});
```

## Advanced Configuration

### Custom Trace ID Header

```typescript
app.use(async (ctx, next) => {
  // Use a custom trace ID header
  const traceId = ctx.request.headers["x-request-id"] || crypto.randomUUID();
  ctx.set("traceId", traceId);
  
  await next();
});
```

### Adding User Context

```typescript
export const Route = createRoute({
  path: "/api/protected",
  beforeLoad: async ({ context }) => {
    const logger = context.get("logger");
    const user = await getUser();
    
    if (user) {
      logger.setUser({
        id: user.id,
        email: user.email,
        name: user.name,
      });
    }
    
    return { user };
  },
});
```

### Breadcrumbs

```typescript
export const Route = createRoute({
  path: "/api/checkout",
  loader: async ({ context }) => {
    const logger = context.get("logger");
    
    logger.addBreadcrumb({
      category: "checkout",
      message: "Starting checkout flow",
      data: { cartId: "cart_123" },
    });
    
    // Validate cart
    logger.addBreadcrumb({
      category: "checkout",
      message: "Cart validated",
    });
    
    // Process payment
    logger.addBreadcrumb({
      category: "payment",
      message: "Payment initiated",
    });
    
    const result = await processPayment();
    return result;
  },
});
```

## Environment Variables

```bash
# .env
FLARELOG_API_KEY=fl_your_api_key
FLARELOG_ENVIRONMENT=production
FLARELOG_RELEASE=1.2.3
```

```typescript
// app.config.ts
import { flarelog } from "@flarelog/sdk";

export const logger = flarelog({
  apiKey: process.env.FLARELOG_API_KEY!,
  environment: process.env.FLARELOG_ENVIRONMENT,
  release: process.env.FLARELOG_RELEASE,
});
```

## Best Practices

1. **Always use context logger**: Access logger via `ctx.get("logger")` to maintain trace context
2. **Log early**: Log at the start of loaders and actions
3. **Include IDs**: Add userId, orderId, etc. to every log
4. **Use child loggers**: Create scoped loggers for complex operations
5. **Set user context**: Identify authenticated users when possible
6. **Add breadcrumbs**: Track multi-step operations
7. **Handle errors**: Use `logError()` for structured error reporting

## Integration with React

Combine with React Error Boundary for full-stack coverage:

```tsx
// app.tsx
import { FlareLogErrorBoundary } from "@flarelog/sdk/react";
import { flarelog } from "@flarelog/sdk";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export default function App() {
  return (
    <FlareLogErrorBoundary logger={logger}>
      <Router />
    </FlareLogErrorBoundary>
  );
}
```

## TypeScript Support

Full TypeScript support with inline types - no `@tanstack/start` dependency required:

```typescript
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";

// Types are included automatically
app.use(tanstackStartMiddleware(logger));
```
