# OpenTelemetry Integration

FlareLog SDK v2 is built on top of OpenTelemetry. While the SDK works out-of-the-box with zero OTel knowledge, understanding the OTel integration helps you leverage advanced features.

## What is OpenTelemetry?

OpenTelemetry (OTel) is an industry-standard, vendor-neutral observability framework for cloud-native software. It provides APIs, SDKs, and tooling to collect and export telemetry data:

- **Logs**: Structured event records capturing severity, body message, and metadata (resource attributes + log attributes).
- **Traces**: Request flows represented as spans across a distributed system.
- **Metrics**: Numerical measurements of performance over time (not currently emitted by this SDK).

FlareLog uses OTel under the hood to standardize logs and traces, ensuring your telemetry is forward-compatible with any OTel collector (like Grafana Cloud, Honeycomb, Datadog, or an OpenTelemetry Collector).

---

## SDK Architecture Under the Hood

The SDK wraps standard OpenTelemetry providers and processors:

```
                  ┌────────────────────────────────────────────────────────┐
                  │                    Your Application                    │
                  └───────────┬────────────────────────────────┬───────────┘
                              │ logs                           │ traces
                              ▼                                ▼
                  ┌───────────────────────┐        ┌───────────────────────┐
                  │    FlareLog Client    │        │       OTel API        │
                  └───────────┬───────────┘        └───────────┬───────────┘
                              │                                │
                              ▼                                ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                    OpenTelemetry SDK                                   │
├───────────────────────────────────────┬────────────────────────────────────────────────┤
│ LoggerProvider                        │ TracerProvider                                 │
│ ├─ LogRecordProcessor                 │ ├─ SpanProcessor                               │
│ │   ├─ SimpleProcessor (Worker Mode)  │ │   ├─ SimpleProcessor (Worker Mode)           │
│ │   └─ BatchProcessor (Node.js Mode)  │ │   └─ BatchProcessor (Node.js Mode)           │
└─┴───┴───┬─────────────────────────────┴─┴───┴───┬──────────────────────────────────────┘
          │                                       │
          ▼                                       ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Exporters / Transports                                                                 │
│ ├─ ConsoleTransport (Default console formatting)                                       │
│ ├─ FlarelogTransport (Ships via custom protocols to Flarelog dashboard)                 │
│ └─ OTLPTransport (Sends standard OTLP/HTTP JSON)                                       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Log and Span Processors

The SDK dynamically selects the OTel processor based on your runtime environment:
- **BatchProcessor**: Default for long-running Node.js processes. Buffers logs and traces, sending them in batches every 5 seconds (configurable via `flushIntervalMs` and `batchSize`) to minimize CPU/network overhead.
- **SimpleProcessor**: Activated in Serverless/Edge environments (Cloudflare Workers, Vercel Edge). Flushes each event immediately to ensure no data is lost before the execution context halts.

---

## Exposing OTel Providers

Because FlareLog initializes standard OTel providers, it exposes them on the `logger` instance. This allows you to integrate standard OTel libraries or third-party instrumentation:

```typescript
import { flarelog } from "@flarelog/sdk";
import { trace } from "@opentelemetry/api";

const logger = flarelog({ apiKey: "fl_your_key" });

// Access the underlying OTel providers
const tracerProvider = logger.tracerProvider;
const loggerProvider = logger.loggerProvider;

// Register them globally so auto-instrumentation libraries can use them
tracerProvider.register();

// Or use the tracer provider to get a custom OTel tracer
const tracer = trace.getTracer("my-custom-library");

await tracer.startActiveSpan("custom-business-step", async (span) => {
  // Your logic here
  span.setAttribute("custom.key", "value");
  span.end();
});
```

---

## When to Use OTel Features

You don't need to configure OTel explicitly for basic logging. The SDK handles everything automatically. However, you may want to use OTel features when:

- You need **distributed tracing** across multiple services
- You want to **fan out** to multiple backends (FlareLog + Grafana + Honeycomb)
- You're integrating with other **OTel-compatible tools**
- You need **W3C trace context propagation** for microservices

## Architecture

```
Your Code → FlareLog SDK → OTel API → OTLP/HTTP JSON → Backend
                              ↓
                         Console (default)
```

The SDK abstracts OTel complexity while exposing it for advanced use cases.

## Next Steps

- [Trace Propagation](trace-propagation.md) — W3C headers and distributed tracing
- [Fan-out](fan-out.md) — Ship to multiple backends simultaneously
