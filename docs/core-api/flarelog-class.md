[**@flarelog/sdk**](../index.md)

***

[@flarelog/sdk](../index.md) / FlareLog

# Class: FlareLog

Defined in: [client.ts:91](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L91)

FlareLog — OTel-native logging client for Cloudflare Workers, Node.js, and browsers.

v2 is a full rewrite on top of OpenTelemetry. Logs and traces are emitted
via the standard OTel API and exported via OTLP/HTTP JSON to any backend.

Backwards compatibility: the v1 surface (`flarelog()`, `logger.info()`,
`workerFetch()`, `logger.child()`, etc.) is preserved. New features:
- `apiKey` is now optional (defaults to console output)
- Multiple transports fan out to console + OTLP + Flarelog simultaneously
- `workerFetch()` emits OTel SERVER spans with W3C traceparent propagation

## Examples

**Local dev — no API key, no OTLP endpoint**

```ts
const logger = flarelog({});
logger.info("Hello");  // pretty-prints to console
```

**Grafana Cloud free tier — no Flarelog API key needed**

```ts
// wrangler.toml: OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp-gateway-prod-eu-west-0.grafana.net"
//                OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Basic <base64>"
const logger = flarelog({});
logger.info("Hello");  // ships to Grafana Cloud
```

**Flarelog hosted backend**

```ts
// wrangler.toml: FLARELOG_API_KEY = "fl_your_key"
const logger = flarelog({});
logger.info("Hello");  // ships to Flarelog dashboard
```

**Fan-out — console in dev, Flarelog + Grafana in prod**

```ts
const logger = flarelog({
  apiKey: env.FLARELOG_API_KEY,        // → Flarelog
  otlpEndpoint: env.OTLP_ENDPOINT,      // → Grafana
  transports: [{ type: "console" }],    // → console
});
```

## Constructors

### Constructor

> **new FlareLog**(`config?`): `FlareLog`

Defined in: [client.ts:133](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L133)

#### Parameters

##### config?

[`FlareLogConfig`](configuration.md) = `{}`

#### Returns

`FlareLog`

## Properties

### tracerProvider

> `readonly` **tracerProvider**: `object`

Defined in: [client.ts:129](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L129)

**`Internal`**

Exposed for advanced users who want to integrate with other OTel libraries

#### getTracer()

> **getTracer**(`name`, `version?`): `Tracer`

##### Parameters

###### name

`string`

###### version?

`string`

##### Returns

`Tracer`

***

### loggerProvider

> `readonly` **loggerProvider**: `LoggerProvider`

Defined in: [client.ts:131](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L131)

**`Internal`**

Exposed for advanced users who want to integrate with other OTel libraries

## Methods

### trace()

> **trace**(`message`, `metadata?`): `void`

Defined in: [client.ts:319](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L319)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### debug()

> **debug**(`message`, `metadata?`): `void`

Defined in: [client.ts:323](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L323)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### info()

> **info**(`message`, `metadata?`): `void`

Defined in: [client.ts:327](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L327)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### warn()

> **warn**(`message`, `metadata?`): `void`

Defined in: [client.ts:331](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L331)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### error()

> **error**(`message`, `metadata?`): `void`

Defined in: [client.ts:335](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L335)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### fatal()

> **fatal**(`message`, `metadata?`): `void`

Defined in: [client.ts:339](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L339)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### log()

> **log**(`level`, `message`, `metadata?`, `opts?`): `void`

Defined in: [client.ts:343](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L343)

#### Parameters

##### level

[`LogLevel`](../api/type-aliases/LogLevel.md)

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

##### opts?

###### source?

`string`

###### traceId?

`string`

###### spanId?

`string`

#### Returns

`void`

***

### logRaw()

> **logRaw**(`entry`): `void`

Defined in: [client.ts:383](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L383)

#### Parameters

##### entry

[`LogEntry`](../api/interfaces/LogEntry.md)

#### Returns

`void`

***

### logError()

> **logError**(`err`, `opts?`): `void`

Defined in: [client.ts:391](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L391)

#### Parameters

##### err

`unknown`

##### opts?

###### message?

`string`

###### level?

[`LogLevel`](../api/type-aliases/LogLevel.md)

###### source?

`string`

###### metadata?

`Record`\<`string`, `unknown`\>

###### traceId?

`string`

#### Returns

`void`

***

### capture()

> **capture**\<`T`\>(`fn`, `opts?`): `Promise`\<`T` \| `undefined`\>

Defined in: [client.ts:415](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L415)

#### Type Parameters

##### T

`T`

#### Parameters

##### fn

() => `T` \| `Promise`\<`T`\>

##### opts?

[`CaptureOptions`](../api/interfaces/CaptureOptions.md)

#### Returns

`Promise`\<`T` \| `undefined`\>

***

### captureSync()

> **captureSync**\<`T`\>(`fn`, `opts?`): `T` \| `undefined`

Defined in: [client.ts:434](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L434)

#### Type Parameters

##### T

`T`

#### Parameters

##### fn

() => `T`

##### opts?

[`CaptureOptions`](../api/interfaces/CaptureOptions.md)

#### Returns

`T` \| `undefined`

***

### withRequest()

> **withRequest**\<`T`\>(`ctx`, `executionCtx`, `handler`): `Promise`\<`T`\>

Defined in: [client.ts:464](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L464)

Wrap a request handler with an OTel SERVER span.

- Extracts W3C traceparent from incoming headers (or starts a new trace)
- Creates a SPAN_KIND_SERVER span with http.method, url.path, etc.
- Attaches the span as active Context so all logs during the handler
  automatically carry traceId + spanId
- Records exceptions and sets span status
- Flushes telemetry via ctx.waitUntil()

#### Type Parameters

##### T

`T`

#### Parameters

##### ctx

[`RequestContext`](../api/interfaces/RequestContext.md)

##### executionCtx

###### waitUntil?

(`promise`) => `void`

##### handler

() => `Promise`\<`T`\>

#### Returns

`Promise`\<`T`\>

***

### startSpan()

> **startSpan**\<`T`\>(`name`, `fn`, `opts?`): `Promise`\<`T`\>

Defined in: [client.ts:541](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L541)

Manually start a span. Returns the span and a wrapped function that ends
the span and flushes telemetry.

#### Type Parameters

##### T

`T`

#### Parameters

##### name

`string`

##### fn

(`span`) => `Promise`\<`T`\>

##### opts?

###### attributes?

`Attributes`

###### kind?

`SpanKind`

#### Returns

`Promise`\<`T`\>

#### Example

```ts
return logger.startSpan("process-payment", async (span) => {
  span.setAttribute("payment.order_id", orderId);
  const result = await charge(orderId);
  span.setAttribute("payment.amount", result.amount);
  return result;
});
```

***

### injectTraceContext()

> **injectTraceContext**(`headers`): `Headers`

Defined in: [client.ts:573](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L573)

Inject the current trace context into outgoing request headers.
Use this when calling other services via fetch() or service bindings
so the trace continues across the call boundary.

#### Parameters

##### headers

`Headers`

#### Returns

`Headers`

***

### getActiveTraceId()

> **getActiveTraceId**(): `string` \| `undefined`

Defined in: [client.ts:578](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L578)

Get the active trace ID (or undefined if no span is active).

#### Returns

`string` \| `undefined`

***

### getActiveSpanId()

> **getActiveSpanId**(): `string` \| `undefined`

Defined in: [client.ts:583](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L583)

Get the active span ID (or undefined if no span is active).

#### Returns

`string` \| `undefined`

***

### addBreadcrumb()

> **addBreadcrumb**(`breadcrumb`): `void`

Defined in: [client.ts:591](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L591)

#### Parameters

##### breadcrumb

`Omit`\<[`Breadcrumb`](../api/interfaces/Breadcrumb.md), `"timestamp"`\>

#### Returns

`void`

***

### setUser()

> **setUser**(`user`): `void`

Defined in: [client.ts:596](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L596)

#### Parameters

##### user

[`UserContext`](../api/interfaces/UserContext.md) \| `null`

#### Returns

`void`

***

### setTag()

> **setTag**(`key`, `value`): `void`

Defined in: [client.ts:600](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L600)

#### Parameters

##### key

`string`

##### value

`string`

#### Returns

`void`

***

### child()

> **child**(`defaults`): [`FlareLogChild`](flarelog-child.md)

Defined in: [client.ts:604](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L604)

#### Parameters

##### defaults

`Record`\<`string`, `unknown`\> \& `object`

#### Returns

[`FlareLogChild`](flarelog-child.md)

***

### workerFetch()

> **workerFetch**\<`T`\>(`handler`): [`WorkerFetchHandler`](../api/type-aliases/WorkerFetchHandler.md)\<`T`\>

Defined in: [client.ts:612](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L612)

#### Type Parameters

##### T

`T` = `Response`

#### Parameters

##### handler

[`WorkerFetchHandler`](../api/type-aliases/WorkerFetchHandler.md)\<`T`\>

#### Returns

[`WorkerFetchHandler`](../api/type-aliases/WorkerFetchHandler.md)\<`T`\>

***

### wrapWorker()

> **wrapWorker**(`WorkerCtor`): (`scriptURL`, `options?`) => `Worker`

Defined in: [client.ts:616](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L616)

#### Parameters

##### WorkerCtor

(`scriptURL`, `options?`) => `Worker`

#### Returns

(`scriptURL`, `options?`) => `Worker`

***

### installConsoleHooks()

> **installConsoleHooks**(`opts?`): () => `void`

Defined in: [client.ts:620](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L620)

#### Parameters

##### opts?

[`ConsoleCaptureOptions`](../api/interfaces/ConsoleCaptureOptions.md)

#### Returns

() => `void`

***

### installGlobalHandlers()

> **installGlobalHandlers**(`opts?`): () => `void`

Defined in: [client.ts:633](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L633)

#### Parameters

##### opts?

###### errors?

`boolean`

###### rejections?

`boolean`

#### Returns

() => `void`

***

### flush()

> **flush**(): `Promise`\<`void`\>

Defined in: [client.ts:694](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L694)

#### Returns

`Promise`\<`void`\>

***

### destroy()

> **destroy**(): `Promise`\<`void`\>

Defined in: [client.ts:698](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L698)

#### Returns

`Promise`\<`void`\>

***

### _getTransports()

> **_getTransports**(): [`Transport`](../api/interfaces/Transport.md)[]

Defined in: [client.ts:763](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L763)

**`Internal`**

Exposed for tests and the factory function

#### Returns

[`Transport`](../api/interfaces/Transport.md)[]
