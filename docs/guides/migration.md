# Migration Guide: v1 to v2

This guide helps you migrate your applications using `@flarelog/sdk` from v1 to v2.

v2 is a complete rewrite of the SDK on top of OpenTelemetry (OTel). While the core API surface remains backwards-compatible, there are architectural changes, new capabilities, and a few deprecations you should be aware of.

## Key Changes in v2

1. **OTel Native Under the Hood**: The SDK now uses the standard OpenTelemetry API and exports telemetry via OTLP/HTTP JSON.
2. **Optional API Key**: `apiKey` is now optional. When omitted, logs and traces fallback to console output, or are exported to any custom OTLP backend.
3. **Multi-backend Fan-out**: You can now configure multiple transports to send logs to the console, an OTLP gateway (like Grafana Cloud, Honeycomb, or Datadog), and the Flarelog dashboard simultaneously.
4. **W3C Trace Context**: Distributed tracing is now standard, using W3C `traceparent` headers.
5. **No Network Requests on Worker Startup**: Telemetry is buffered and flushed lazily, preventing runtime failures on Cloudflare Workers startup.

---

## 1. Configuration Changes

In v1, the `apiKey` property was required to initialize the logger. In v2, it is completely optional.

### v1 Configuration (Required Key)
```typescript
import { flarelog } from "@flarelog/sdk";

const logger = flarelog({
  apiKey: "fl_your_api_key", // required in v1
});
```

### v2 Configuration (Optional Key & Transports)
```typescript
import { flarelog } from "@flarelog/sdk";

// Zero-config fallback to console:
const logger = flarelog({});

// Explicit OTLP backend configuration (no FlareLog key needed):
const otelLogger = flarelog({
  otlpEndpoint: "https://your-otel-collector.com",
  otlpHeaders: { Authorization: "Bearer <token>" },
});
```

### Configuration Options Mapping

- `batchSize`: Works differently depending on the runtime. Defaults to `50` on Node.js and `1` on Workers/Edge.
- `flushIntervalMs`: Defaults to `5000`ms on Node.js and `0`ms on Workers/Edge.
- **Unimplemented/Deprecated**: The options `autoCapture.http`, `autoCapture.navigation`, and `autoCapture.clicks` are accepted in the type definition but are not yet implemented. Omit them or use manual `addBreadcrumb` calls.

---

## 2. Cloudflare Workers Lifecycle

In v1, logs could sometimes be dropped if a Worker execution finished before the fetch promise resolved. 

In v2, the `workerFetch()` helper and the `honoMiddleware()` wrapper automatically capture the request context, start a SERVER span, and guarantee the flush of all pending logs/traces using `ctx.waitUntil()` on completion.

### Recommended Worker Pattern
```typescript
import { flarelog, workerFetch } from "@flarelog/sdk";

export default {
  fetch: workerFetch(
    // ALWAYS instantiate flarelog() inside the handler or use lazy evaluation
    flarelog(),
    async (request, env, ctx) => {
      // Your handler code
      return new Response("OK");
    }
  ),
};
```

*Note: Avoid defining `const logger = flarelog(...)` at module scope in Workers, as environment variables and bindings are not yet available there. Instantiate it inside the handler.*

---

## 3. Deprecated or Internal API Changes

Some internal or custom properties from v1 have been renamed or refactored:

- **Custom Processors**: Custom log processors have been replaced by standard OpenTelemetry `LogRecordProcessor` and `SpanProcessor` implementations.
- **Manual context wrappers**: If you were manually managing spans and traces, use the new W3C helpers:
  ```typescript
  import { extractContext, injectContext, getActiveSpanContext, withActiveSpan } from "@flarelog/sdk";
  ```
