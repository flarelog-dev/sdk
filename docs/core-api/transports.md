# Transports

FlareLog supports multiple transports for shipping telemetry to different backends.

## Built-in Transports

### Console Transport

Default when no API key or OTLP endpoint is configured. Pretty-prints logs to stdout/stderr.

```typescript
import { flarelog } from "@flarelog/sdk";

const logger = flarelog({});
// No API key → defaults to console output
logger.info("Hello");  // pretty-prints to console
```

### FlareLog Transport

Ships telemetry to FlareLog's hosted backend. Requires an API key.

```typescript
const logger = flarelog({
  apiKey: "fl_your_api_key",
});
// Ships to flarelog.dev dashboard
```

### OTLP Transport

Ships telemetry to any OTLP/HTTP JSON endpoint.

```typescript
const logger = flarelog({
  otlpEndpoint: "https://otlp-gateway-prod-eu-west-0.grafana.net",
  otlpHeaders: {
    Authorization: "Basic " + btoa(`${GRAFANA_INSTANCE_ID}:${GRAFANA_API_KEY}`),
  },
});
```

## Fan-out (Multiple Transports)

Ship to multiple backends simultaneously:

```typescript
const logger = flarelog({
  transports: [
    { type: "console" },
    { type: "flarelog", apiKey: process.env.FLARELOG_API_KEY },
    {
      type: "otlp",
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
  ],
});
```

## Environment Variables

Transports can be configured via environment variables:

| Variable | Transport | Description |
|---|---|---|
| `FLARELOG_API_KEY` | FlareLog | Enables FlareLog hosted backend |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP | OTLP/HTTP endpoint URL |
| `OTEL_EXPORTER_OTLP_HEADERS` | OTLP | OTLP headers (Key=Value,Key2=Value2) |

```bash
# .env
FLARELOG_API_KEY=fl_your_api_key
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-eu-west-0.grafana.net
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic\ base64token
```

## Transport Configuration

### Explicit Transport List

Override auto-detection with explicit transports:

```typescript
const logger = flarelog({
  transports: [
    { type: "console" },
    { type: "flarelog", apiKey: "fl_key" },
    {
      type: "otlp",
      endpoint: "https://otlp.example.com",
      headers: { Authorization: "Bearer token" },
    },
  ],
});
```

## Transport Classes

For advanced use, you can instantiate transport classes directly:

```typescript
import { FlarelogTransport, OTLPTransport, ConsoleTransport } from "@flarelog/sdk";

const flarelogTransport = new FlarelogTransport({
  apiKey: "fl_your_key",
  endpoint: "https://flarelog.dev",
});

const otlpTransport = new OTLPTransport({
  endpoint: "https://otlp.example.com",
  headers: { Authorization: "Bearer token" },
});

const consoleTransport = new ConsoleTransport();
```
