# OpenTelemetry Integration

FlareLog SDK v2 is built on top of OpenTelemetry. While the SDK works out-of-the-box with zero OTel knowledge, understanding the OTel integration helps you leverage advanced features.

## What is OpenTelemetry?

OpenTelemetry (OTel) is an open-source observability framework that provides:

- **Traces** — Request flow across services
- **Logs** — Structured event records
- **Metrics** — Performance measurements

FlareLog uses OTel under the hood to provide these capabilities without requiring you to manage OTel directly.

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
