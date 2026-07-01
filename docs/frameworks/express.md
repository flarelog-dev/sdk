# FlareLog SDK - Express Guide

Zero-config logging for [Express](https://expressjs.com/) applications. Automatically capture request logs, errors, and traces with trace IDs.

## Installation

```bash
npm install @flarelog/sdk express
```

`express` is a peer dependency — install it if you haven't already.

## Quick Start

```typescript
import express from "express";
import { flarelog } from "@flarelog/sdk";
import { expressMiddleware, expressErrorHandler } from "@flarelog/sdk/express";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });
const app = express();

// Request logging (register first)
app.use(expressMiddleware(logger));

app.get("/api/hello", (req, res) => {
  req.logger.info("Hello from Express!");
  res.json({ ok: true });
});

// Error handling (register last)
app.use(expressErrorHandler(logger));

app.listen(3000, () => {
  logger.info("Server running on port 3000");
});
```

Without an API key, logs are written to the console by default, so you can start developing immediately.

## What Gets Logged Automatically

### Request Middleware (`expressMiddleware`)

Every request flowing through `expressMiddleware` gets:
- **Trace ID**: Extracted from the `x-trace-id` header or automatically generated as a UUID.
- **Request Logger**: A child logger attached to `req.logger` pre-configured with context (`method`, `path`, `ip`, and `traceId`).
- **Response Logging**: Listens to the `finish` event of the response and automatically logs the completion with status code and duration in milliseconds.

#### Log Levels by Status Code

| Status Range | Log Level |
|-------------|-----------|
| 2xx-3xx | INFO |
| 4xx | WARN |
| 5xx | ERROR |

### Error Handler (`expressErrorHandler`)

Registering `expressErrorHandler` after all other middleware and routes ensures that unhandled errors are automatically logged:
- Calls `req.logger.logError()` with the error stack trace, HTTP method, and path.
- Automatically responds with a `500` status and `{ error: "Internal server error" }`.

## Using the Logger in Handlers

Use `req.logger` in your handlers to ensure your application logs are correlated with the HTTP request and trace ID:

```typescript
app.get("/api/orders/:id", async (req, res) => {
  const orderId = req.params.id;
  
  req.logger.info("Fetching order details", { orderId });
  
  const order = await db.orders.findById(orderId);
  if (!order) {
    req.logger.warn("Order not found", { orderId });
    return res.status(404).json({ error: "Not found" });
  }
  
  // Create a scoped child logger for nested operations
  const dbLogger = req.logger.child({ operation: "fetch-items" });
  const items = await db.items.findByOrderId(order.id);
  dbLogger.info("Items fetched", { count: items.length });
  
  res.json({ order, items });
});
```

## Environment Variables

```bash
# .env
FLARELOG_API_KEY=fl_your_api_key
FLARELOG_ENVIRONMENT=production
FLARELOG_RELEASE=1.2.3
FLARELOG_SERVER_NAME=express-server
```

## Best Practices

1. **Always use `req.logger`** inside routes to keep context tags (IP, method, path) and trace ID attached to your logs.
2. **Order Matters**: Always place `expressMiddleware` at the very top of your middleware stack, and `expressErrorHandler` at the very bottom.
3. **Use Child Loggers**: If a request does complex database queries, spawn a `req.logger.child({ component: "db" })` to make filtering logs in the dashboard easy.
