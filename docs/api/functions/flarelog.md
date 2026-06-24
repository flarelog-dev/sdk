[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / flarelog

# Function: flarelog()

> **flarelog**(`config?`): [`FlareLog`](../classes/FlareLog.md)

Defined in: [factory.ts:86](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/factory.ts#L86)

Branded factory function to create a FlareLog logger with sensible defaults.

v2 is OTel-native. The `flarelog()` factory:
- Auto-detects environment, release, and serverName from runtime context
- Auto-detects transports from env vars (OTEL_EXPORTER_OTLP_*, FLARELOG_API_KEY)
- Auto-enables console, globalErrors, and rejections capture
- Falls back to console-only output when no backend is configured

## Parameters

### config?

[`FlareLogConfig`](../interfaces/FlareLogConfig.md) = `{}`

## Returns

[`FlareLog`](../classes/FlareLog.md)

## Examples

**Zero config — console output**

```ts
const logger = flarelog({});
logger.info("Hello");  // → console (pretty-printed)
```

**Grafana Cloud — no Flarelog API key needed**

```ts
// env: OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_HEADERS
const logger = flarelog({});
logger.info("Hello");  // → Grafana Cloud
```

**Flarelog hosted**

```ts
// env: FLARELOG_API_KEY
const logger = flarelog({});
logger.info("Hello");  // → flarelog.dev dashboard
```

**Explicit API key (v1 style, still supported)**

```ts
const logger = flarelog({ apiKey: "fl_your_key" });
```
