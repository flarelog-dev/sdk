[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / FlareLogConfig

# Interface: FlareLogConfig

Defined in: [types.ts:63](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L63)

Configuration options for the FlareLog client (v2 — OTel-native).

The biggest change from v1: `apiKey` is now OPTIONAL. With no API key and no
OTLP endpoint configured, the SDK defaults to console output. This makes the
SDK useful out-of-the-box with zero backend setup.

## Properties

### apiKey?

> `optional` **apiKey?**: `string`

Defined in: [types.ts:71](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L71)

Flarelog API key (optional).

When provided, enables the Flarelog hosted backend transport.
When omitted, the SDK still works — it just exports to console and/or
any OTLP endpoint you configure via `transports` or env vars.

***

### endpoint?

> `optional` **endpoint?**: `string`

Defined in: [types.ts:74](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L74)

Flarelog endpoint. Defaults to https://flarelog.dev

***

### allowInsecure?

> `optional` **allowInsecure?**: `boolean`

Defined in: [types.ts:77](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L77)

Allow insecure HTTP endpoints (not recommended). Defaults to false

***

### level?

> `optional` **level?**: [`LogLevel`](../type-aliases/LogLevel.md)

Defined in: [types.ts:80](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L80)

Minimum log level to send. Defaults to "DEBUG"

***

### batchSize?

> `optional` **batchSize?**: `number`

Defined in: [types.ts:83](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L83)

Number of logs to batch before sending. Defaults to 50 (Node), 1 (Worker)

***

### flushIntervalMs?

> `optional` **flushIntervalMs?**: `number`

Defined in: [types.ts:86](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L86)

Flush interval in milliseconds. Defaults to 5000 (Node), 0 (Worker)

***

### debug?

> `optional` **debug?**: `boolean`

Defined in: [types.ts:89](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L89)

Whether to enable debug logging (OTel diag logger + extra console output). Defaults to false

***

### warnOnConsoleFallback?

> `optional` **warnOnConsoleFallback?**: `boolean`

Defined in: [types.ts:109](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L109)

Warn to `console.warn` when the SDK falls back to `ConsoleTransport`
because no backend is configured (i.e., `FLARELOG_API_KEY` and
`OTEL_EXPORTER_OTLP_ENDPOINT` are both unset AND no explicit `transports`
array was provided).

This catches the most common deployment bug: the user set an API key in
their platform's dashboard (e.g. Cloudflare Workers, Lovable, Vercel) but
the SDK can't see it from `process.env` at module load, so it silently
falls back to console-only logging and nothing ships to the dashboard.

- `true` (default): emit a one-time `console.warn` describing the fallback
  and how to fix it.
- `false`: suppress the warning (for users who intentionally want
  console-only logging).

The warning is emitted at most once per `FlareLog` instance.

***

### defaultSource?

> `optional` **defaultSource?**: `string`

Defined in: [types.ts:112](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L112)

Default source tag for all logs

***

### includeTimestamps?

> `optional` **includeTimestamps?**: `boolean`

Defined in: [types.ts:115](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L115)

Whether to include timestamps automatically. Defaults to true

***

### autoCapture?

> `optional` **autoCapture?**: [`AutoCaptureConfig`](AutoCaptureConfig.md)

Defined in: [types.ts:118](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L118)

Automatic error capture configuration

***

### environment?

> `optional` **environment?**: `string`

Defined in: [types.ts:121](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L121)

Environment name (e.g., "production", "staging", "development") — sets deployment.environment.name resource attr

***

### release?

> `optional` **release?**: `string`

Defined in: [types.ts:124](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L124)

Release version — sets service.version resource attr

***

### serverName?

> `optional` **serverName?**: `string`

Defined in: [types.ts:127](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L127)

Server hostname — sets host.name resource attr

***

### serviceName?

> `optional` **serviceName?**: `string`

Defined in: [types.ts:130](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L130)

Service name — sets service.name resource attr. Defaults to npm_package_name or "unknown_service"

***

### serviceNamespace?

> `optional` **serviceNamespace?**: `string`

Defined in: [types.ts:133](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L133)

Service namespace — sets service.namespace resource attr

***

### resourceAttributes?

> `optional` **resourceAttributes?**: `Record`\<`string`, `string`\>

Defined in: [types.ts:136](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L136)

Extra resource attributes (in addition to OTEL_RESOURCE_ATTRIBUTES env var)

***

### beforeSend?

> `optional` **beforeSend?**: (`log`) => `false` \| [`LogEntry`](LogEntry.md)

Defined in: [types.ts:139](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L139)

Callback to modify or drop logs before sending. Return false to drop.

#### Parameters

##### log

[`LogEntry`](LogEntry.md)

#### Returns

`false` \| [`LogEntry`](LogEntry.md)

***

### scrubFields?

> `optional` **scrubFields?**: `string`[]

Defined in: [types.ts:142](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L142)

Fields to scrub from metadata (PII redaction). Defaults to common sensitive fields. Keys are matched by substring. SDK-instrumented attributes under the `gen_ai.*` and `flarelog.*` namespaces are exempt.

***

### sampleRate?

> `optional` **sampleRate?**: `number`

Defined in: [types.ts:145](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L145)

Sample rate for logs (0.0 to 1.0). Defaults to 1.0 (100%)

***

### maxBatchSize?

> `optional` **maxBatchSize?**: `number`

Defined in: [types.ts:148](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L148)

Max in-flight buffer size. Defaults to 100

***

### onDrop?

> `optional` **onDrop?**: (`droppedCount`) => `void`

Defined in: [types.ts:151](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L151)

Callback invoked when logs are dropped due to buffer overflow.

#### Parameters

##### droppedCount

`number`

#### Returns

`void`

***

### workerMode?

> `optional` **workerMode?**: `boolean`

Defined in: [types.ts:154](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L154)

Worker mode: auto-detects if not set. When true, uses SimpleProcessor (flush on every event).

***

### transports?

> `optional` **transports?**: [`TransportConfig`](../type-aliases/TransportConfig.md)[]

Defined in: [types.ts:160](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L160)

Explicit list of transports. Overrides env-var-based auto-detection.
Use this when you want full control (e.g. fan-out to console + OTLP + Flarelog).

***

### otlpEndpoint?

> `optional` **otlpEndpoint?**: `string`

Defined in: [types.ts:167](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L167)

OTLP/HTTP endpoint for any OTel backend (Grafana Cloud, Honeycomb, Tempo, etc.).
Shorthand for `transports: [{ type: "otlp", endpoint }]`.
Can also be set via OTEL_EXPORTER_OTLP_ENDPOINT env var.

***

### otlpHeaders?

> `optional` **otlpHeaders?**: `Record`\<`string`, `string`\>

Defined in: [types.ts:170](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L170)

Headers for the OTLP transport (e.g. Authorization). Shorthand for transports[0].headers.

***

### ignorePaths?

> `optional` **ignorePaths?**: (`string` \| `RegExp` \| ((`pathname`) => `boolean`))[]

Defined in: [types.ts:204](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L204)

Request path patterns to skip when wrapping handlers with
`workerFetch()`, `pagesFunction()`, or `logger.withRequest()`.

When the incoming request's URL pathname matches any entry, the SDK
bypasses span creation, log emission, and end-of-request flush entirely
— the handler runs as if the SDK weren't installed. This is the
recommended way to keep browser-driven noise (e.g. `/favicon.ico`,
`/robots.txt`, static-asset prefixes) out of your dashboard without
touching your handler code.

Each entry can be:
- a string: matched if the pathname equals it (case-sensitive)
- a RegExp: matched if `pattern.test(pathname)` returns true
- a function: matched if `(pathname) => boolean` returns true

Matching happens against `new URL(request.url).pathname` only — query
string and host are ignored.

#### Example

```ts
const logger = flarelog({
  apiKey: env.FLARELOG_API_KEY,
  ignorePaths: ["/favicon.ico", "/robots.txt", /^/static//],
});
```

Bypass is also applied automatically to `OPTIONS` and `HEAD` requests
(mirrors `@sentry/cloudflare`'s behaviour) — those methods are almost
always CORS preflight or cache-validation traffic and shouldn't
generate telemetry.

***

### ai?

> `optional` **ai?**: `boolean` \| [`AIInstrumentationConfig`](AIInstrumentationConfig.md)

Defined in: [types.ts:233](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L233)

Enable AI inference observability with zero config.

- `true`: activates global `fetch()` interception for OpenAI, Anthropic,
  and other supported providers. Token usage, cost, latency, and errors
  are captured automatically.
- `false` / omitted: no AI instrumentation (default).
- Object: full [AIInstrumentationConfig](AIInstrumentationConfig.md) for fine-grained control
  (sample capture, price overrides, extra providers, etc.).

When enabled, call `logger.disposeAI()` to remove instrumentation,
or `logger.destroy()` to clean up everything at once.

#### Examples

**Zero-config**

```ts
const logger = flarelog({ apiKey, ai: true });
// any fetch() to OpenAI/Anthropic is now captured
```

**Full config**

```ts
const logger = flarelog({
  apiKey,
  ai: { captureSamples: true, priceOverrides: { "gpt-4o": { input: 5, output: 15 } } },
});
```
