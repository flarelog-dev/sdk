# Fan-out to Multiple Backends

Ship logs to both FlareLog and any OTLP-compatible backend simultaneously.

## Why Fan-out?

Fan-out allows you to:

- **Migrate gradually** — Ship to both old and new backends during transition
- **Redundancy** — Have multiple copies of your observability data
- **Different tools for different teams** — FlareLog for developers, Grafana for ops
- **Cost optimization** — Use different backends for different data types

## Configuration

Use the `transports` array to configure multiple backends:

```typescript
import { flarelog } from "@flarelog/sdk";

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

You can also use environment variables for fan-out:

```bash
# .env
FLARELOG_API_KEY=fl_your_api_key
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-eu-west-0.grafana.net
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic\ base64token
```

```typescript
const logger = flarelog({});
// Auto-detects both FLARELOG_API_KEY and OTEL_EXPORTER_OTLP_ENDPOINT
// Ships to both backends + console
```

## Common Backends

### Grafana Cloud

```typescript
const logger = flarelog({
  transports: [
    { type: "flarelog", apiKey: process.env.FLARELOG_API_KEY },
    {
      type: "otlp",
      endpoint: "https://otlp-gateway-prod-eu-west-0.grafana.net",
      headers: {
        Authorization: "Basic " + btoa(`${GRAFANA_INSTANCE_ID}:${GRAFANA_API_KEY}`),
      },
    },
  ],
});
```

### Honeycomb

```typescript
const logger = flarelog({
  transports: [
    { type: "flarelog", apiKey: process.env.FLARELOG_API_KEY },
    {
      type: "otlp",
      endpoint: "https://api.honeycomb.io/v1/traces",
      headers: {
        "x-honeycomb-team": process.env.HONEYCOMB_API_KEY,
      },
    },
  ],
});
```

### Datadog

```typescript
const logger = flarelog({
  transports: [
    { type: "flarelog", apiKey: process.env.FLARELOG_API_KEY },
    {
      type: "otlp",
      endpoint: "https://trace.agent.datadoghq.com/api/v0.2/traces",
      headers: {
        "DD-API-KEY": process.env.DD_API_KEY,
      },
    },
  ],
});
```

## Selective Fan-out

Use `beforeSend` to route different logs to different backends:

```typescript
const logger = flarelog({
  transports: [
    { type: "flarelog", apiKey: process.env.FLARELOG_API_KEY },
    {
      type: "otlp",
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
  ],
  beforeSend: (log) => {
    // Add backend routing hint
    if (log.level === "ERROR" || log.level === "FATAL") {
      log.metadata = { ...log.metadata, _route: "all" };
    }
    return log;
  },
});
```

## Performance Considerations

- Each transport adds network overhead
- Consider using `sampleRate` to reduce volume for high-traffic apps
- Use `workerMode: true` in serverless environments to flush immediately

## Troubleshooting

### Logs not appearing in one backend

1. Check that the backend endpoint is correct
2. Verify API keys and headers
3. Enable `debug: true` to see transport diagnostics
4. Check network connectivity from your environment
