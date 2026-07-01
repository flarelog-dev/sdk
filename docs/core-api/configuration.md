[**@flarelog/sdk**](../index.md)

***

[@flarelog/sdk](../index.md) / FlareLogConfig

# Interface: FlareLogConfig

Defined in: [types.ts:61](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L61)

Configuration options for the FlareLog client (v2 — OTel-native).

The biggest change from v1: `apiKey` is now OPTIONAL. With no API key and no
OTLP endpoint configured, the SDK defaults to console output. This makes the
SDK useful out-of-the-box with zero backend setup.

## Properties

### apiKey?

> `optional` **apiKey?**: `string`

Defined in: [types.ts:69](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L69)

Flarelog API key (optional).

When provided, enables the Flarelog hosted backend transport.
When omitted, the SDK still works — it just exports to console and/or
any OTLP endpoint you configure via `transports` or env vars.

***

### endpoint?

> `optional` **endpoint?**: `string`

Defined in: [types.ts:72](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L72)

Flarelog endpoint. Defaults to https://flarelog.dev

***

### allowInsecure?

> `optional` **allowInsecure?**: `boolean`

Defined in: [types.ts:75](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L75)

Allow insecure HTTP endpoints (not recommended). Defaults to false

***

### level?

> `optional` **level?**: [`LogLevel`](../api/type-aliases/LogLevel.md)

Defined in: [types.ts:78](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L78)

Minimum log level to send. Defaults to "DEBUG"

***

### batchSize?

> `optional` **batchSize?**: `number`

Defined in: [types.ts:81](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L81)

Number of logs to batch before sending. Defaults to 50 (Node), 1 (Worker)

***

### flushIntervalMs?

> `optional` **flushIntervalMs?**: `number`

Defined in: [types.ts:84](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L84)

Flush interval in milliseconds. Defaults to 5000 (Node), 0 (Worker)

***

### debug?

> `optional` **debug?**: `boolean`

Defined in: [types.ts:87](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L87)

Whether to enable debug logging (OTel diag logger + extra console output). Defaults to false

***

### defaultSource?

> `optional` **defaultSource?**: `string`

Defined in: [types.ts:90](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L90)

Default source tag for all logs

***

### includeTimestamps?

> `optional` **includeTimestamps?**: `boolean`

Defined in: [types.ts:93](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L93)

Whether to include timestamps automatically. Defaults to true

***

### autoCapture?

> `optional` **autoCapture?**: [`AutoCaptureConfig`](../api/interfaces/AutoCaptureConfig.md)

Defined in: [types.ts:96](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L96)

Automatic error capture configuration

***

### environment?

> `optional` **environment?**: `string`

Defined in: [types.ts:99](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L99)

Environment name (e.g., "production", "staging", "development") — sets deployment.environment.name resource attr

***

### release?

> `optional` **release?**: `string`

Defined in: [types.ts:102](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L102)

Release version — sets service.version resource attr

***

### serverName?

> `optional` **serverName?**: `string`

Defined in: [types.ts:105](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L105)

Server hostname — sets host.name resource attr

***

### serviceName?

> `optional` **serviceName?**: `string`

Defined in: [types.ts:108](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L108)

Service name — sets service.name resource attr. Defaults to npm_package_name or "unknown_service"

***

### serviceNamespace?

> `optional` **serviceNamespace?**: `string`

Defined in: [types.ts:111](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L111)

Service namespace — sets service.namespace resource attr

***

### resourceAttributes?

> `optional` **resourceAttributes?**: `Record`<`string`, `string`>

Defined in: [types.ts:114](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L114)

Extra resource attributes (in addition to OTEL_RESOURCE_ATTRIBUTES env var)

***

### beforeSend?

> `optional` **beforeSend?**: (`log`) => `false` | [`LogEntry`](../api/interfaces/LogEntry.md)

Defined in: [types.ts:117](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L117)

Callback to modify or drop logs before sending. Return false to drop.

#### Parameters

##### log

[`LogEntry`](../api/interfaces/LogEntry.md)

#### Returns

`false` | [`LogEntry`](../api/interfaces/LogEntry.md)

***

### scrubFields?

> `optional` **scrubFields?**: `string`[]

Defined in: [types.ts:120](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L120)

Fields to scrub from metadata (PII redaction). Defaults to common sensitive fields.

***

### sampleRate?

> `optional` **sampleRate?**: `number`

Defined in: [types.ts:123](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L123)

Sample rate for logs (0.0 to 1.0). Defaults to 1.0 (100%)

***

### maxBatchSize?

> `optional` **maxBatchSize?**: `number`

Defined in: [types.ts:126](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L126)

Max in-flight buffer size. Defaults to 100

***

### onDrop?

> `optional` **onDrop?**: (`droppedCount`) => `void`

Defined in: [types.ts:129](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L129)

Callback invoked when logs are dropped due to buffer overflow.

#### Parameters

##### droppedCount

`number`

#### Returns

`void`

***

### workerMode?

> `optional` **workerMode?**: `boolean`

Defined in: [types.ts:132](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L132)

Worker mode: auto-detects if not set. When true, uses SimpleProcessor (flush on every event).

***

### transports?

> `optional` **transports?**: [`TransportConfig`](../api/type-aliases/TransportConfig.md)[]

Defined in: [types.ts:138](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L138)

Explicit list of transports. Overrides env-var-based auto-detection.
Use this when you want full control (e.g. fan-out to console + OTLP + Flarelog).

***

### otlpEndpoint?

> `optional` **otlpEndpoint?**: `string`

Defined in: [types.ts:145](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L145)

OTLP/HTTP endpoint for any OTel backend (Grafana Cloud, Honeycomb, Tempo, etc.).
Shorthand for `transports: [{ type: "otlp", endpoint }]`.
Can also be set via OTEL_EXPORTER_OTLP_ENDPOINT env var.

***

### otlpHeaders?

> `optional` **otlpHeaders?**: `Record`<`string`, `string`>

Defined in: [types.ts:168](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L168)

Headers for the OTLP transport (e.g. Authorization). Shorthand for transports[0].headers.

***

### warnOnConsoleFallback?

> `optional` **warnOnConsoleFallback?**: `boolean`

Defined in: [types.ts:107](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L107)

Warn to `console.warn` when the SDK falls back to `ConsoleTransport` because no backend is configured (i.e., `FLARELOG_API_KEY` and `OTEL_EXPORTER_OTLP_ENDPOINT` are both unset AND no explicit `transports` array was provided).

- `true` (default): emit a one-time `console.warn` describing the fallback and how to fix it.
- `false`: suppress the warning (for users who intentionally want console-only logging).

The warning is emitted at most once per `FlareLog` instance.

***

### ignorePaths?

> `optional` **ignorePaths?**: `Array`<`string` | `RegExp` | (`pathname`: `string`) => `boolean`>

Defined in: [types.ts:202](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L202)

Request path patterns to skip when wrapping handlers with `workerFetch()`, `pagesFunction()`, or `logger.withRequest()`.

When the incoming request's URL pathname matches any entry, the SDK bypasses span creation, log emission, and end-of-request flush entirely — the handler runs as if the SDK weren't installed. This is the recommended way to keep browser-driven noise (e.g. `/favicon.ico`, `/robots.txt`, static-asset prefixes) out of your dashboard without touching your handler code.

Each entry can be:
- a string: matched if the pathname equals it (case-sensitive)
- a RegExp: matched if `pattern.test(pathname)` returns true
- a function: matched if `(pathname) => boolean` returns true

Matching happens against `new URL(request.url).pathname` only — query string and host are ignored.

***

### scrubFields?

> `optional` **scrubFields?**: `string[]`

Defined in: [types.ts:140](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L140)

Fields to scrub from metadata (PII redaction). When a key in `metadata` matches any entry in this array, its value is replaced with `"[REDACTED]"` before the log is exported.

Defaults to common sensitive fields (e.g. `password`, `secret`, `token`, `authorization`).

***

### onDrop?

> `optional` **onDrop?**: (`droppedCount`: `number`) => `void`

Defined in: [types.ts:149](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L149)

Callback invoked when logs are dropped due to buffer overflow (i.e. the in-flight queue exceeds `maxBatchSize`). Use this to track telemetry loss in your own metrics or alerting system.

```typescript
const logger = flarelog({
  maxBatchSize: 100,
  onDrop: (count) => {
    console.warn(`FlareLog dropped ${count} log(s) due to buffer overflow`);
  },
});
```

***
