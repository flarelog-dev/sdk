[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / FlareLog

# Class: FlareLog

Defined in: [client.ts:161](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L161)

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

Defined in: [client.ts:205](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L205)

#### Parameters

##### config?

[`FlareLogConfig`](../interfaces/FlareLogConfig.md) = `{}`

#### Returns

`FlareLog`

## Properties

### tracerProvider

> `readonly` **tracerProvider**: `object`

Defined in: [client.ts:201](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L201)

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

Defined in: [client.ts:203](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L203)

**`Internal`**

Exposed for advanced users who want to integrate with other OTel libraries

## Methods

### trace()

> **trace**(`message`, `metadata?`): `void`

Defined in: [client.ts:452](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L452)

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

Defined in: [client.ts:456](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L456)

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

Defined in: [client.ts:460](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L460)

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

Defined in: [client.ts:464](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L464)

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

Defined in: [client.ts:468](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L468)

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

Defined in: [client.ts:472](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L472)

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

Defined in: [client.ts:476](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L476)

#### Parameters

##### level

[`LogLevel`](../type-aliases/LogLevel.md)

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

Defined in: [client.ts:516](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L516)

#### Parameters

##### entry

[`LogEntry`](../interfaces/LogEntry.md)

#### Returns

`void`

***

### logError()

> **logError**(`err`, `opts?`): `void`

Defined in: [client.ts:524](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L524)

#### Parameters

##### err

`unknown`

##### opts?

###### message?

`string`

###### level?

[`LogLevel`](../type-aliases/LogLevel.md)

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

Defined in: [client.ts:548](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L548)

#### Type Parameters

##### T

`T`

#### Parameters

##### fn

() => `T` \| `Promise`\<`T`\>

##### opts?

[`CaptureOptions`](../interfaces/CaptureOptions.md)

#### Returns

`Promise`\<`T` \| `undefined`\>

***

### captureSync()

> **captureSync**\<`T`\>(`fn`, `opts?`): `T` \| `undefined`

Defined in: [client.ts:567](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L567)

#### Type Parameters

##### T

`T`

#### Parameters

##### fn

() => `T`

##### opts?

[`CaptureOptions`](../interfaces/CaptureOptions.md)

#### Returns

`T` \| `undefined`

***

### withRequest()

> **withRequest**\<`T`\>(`ctx`, `executionCtx`, `handler`): `Promise`\<`T`\>

Defined in: [client.ts:604](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L604)

Wrap a request handler with an OTel SERVER span.

- Extracts W3C traceparent from incoming headers (or starts a new trace)
- Creates a SPAN_KIND_SERVER span with http.method, url.path, etc.
- Attaches the span as active Context so all logs during the handler
  automatically carry traceId + spanId
- Records exceptions and sets span status
- Flushes telemetry via ctx.waitUntil()

Bypass: if `ctx.skipInstrumentation` is true, OR the request method is
`OPTIONS`/`HEAD`, OR the request's pathname matches any entry in the
`ignorePaths` config, the handler runs without a span, without log
enrichment, and without an end-of-request flush. This is the recommended
way to keep browser-driven noise (e.g. `/favicon.ico`) and CORS preflight
traffic out of your dashboard.

#### Type Parameters

##### T

`T`

#### Parameters

##### ctx

[`RequestContext`](../interfaces/RequestContext.md)

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

Defined in: [client.ts:699](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L699)

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

Defined in: [client.ts:732](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L732)

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

Defined in: [client.ts:737](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L737)

Get the active trace ID (or undefined if no span is active).

#### Returns

`string` \| `undefined`

***

### getActiveSpanId()

> **getActiveSpanId**(): `string` \| `undefined`

Defined in: [client.ts:742](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L742)

Get the active span ID (or undefined if no span is active).

#### Returns

`string` \| `undefined`

***

### addBreadcrumb()

> **addBreadcrumb**(`breadcrumb`): `void`

Defined in: [client.ts:750](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L750)

#### Parameters

##### breadcrumb

`Omit`\<[`Breadcrumb`](../interfaces/Breadcrumb.md), `"timestamp"`\>

#### Returns

`void`

***

### setUser()

> **setUser**(`user`): `void`

Defined in: [client.ts:755](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L755)

#### Parameters

##### user

[`UserContext`](../interfaces/UserContext.md) \| `null`

#### Returns

`void`

***

### setTag()

> **setTag**(`key`, `value`): `void`

Defined in: [client.ts:759](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L759)

#### Parameters

##### key

`string`

##### value

`string`

#### Returns

`void`

***

### child()

> **child**(`defaults`): [`FlareLogChild`](FlareLogChild.md)

Defined in: [client.ts:763](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L763)

#### Parameters

##### defaults

`Record`\<`string`, `unknown`\> & `object`

#### Returns

[`FlareLogChild`](FlareLogChild.md)

***

### workerFetch()

> **workerFetch**\<`T`\>(`handler`): [`WorkerFetchHandler`](../type-aliases/WorkerFetchHandler.md)\<`T`\>

Defined in: [client.ts:771](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L771)

#### Type Parameters

##### T

`T` = `Response`

#### Parameters

##### handler

[`WorkerFetchHandler`](../type-aliases/WorkerFetchHandler.md)\<`T`\>

#### Returns

[`WorkerFetchHandler`](../type-aliases/WorkerFetchHandler.md)\<`T`\>

***

### wrapWorker()

> **wrapWorker**(`WorkerCtor`): (`scriptURL`, `options?`) => `Worker`

Defined in: [client.ts:775](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L775)

#### Parameters

##### WorkerCtor

(`scriptURL`, `options?`) => `Worker`

#### Returns

(`scriptURL`, `options?`) => `Worker`

***

### installConsoleHooks()

> **installConsoleHooks**(`opts?`): () => `void`

Defined in: [client.ts:779](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L779)

#### Parameters

##### opts?

[`ConsoleCaptureOptions`](../interfaces/ConsoleCaptureOptions.md)

#### Returns

() => `void`

***

### installGlobalHandlers()

> **installGlobalHandlers**(`opts?`): () => `void`

Defined in: [client.ts:792](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L792)

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

Defined in: [client.ts:853](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L853)

#### Returns

`Promise`\<`void`\>

***

### disposeAI()

> **disposeAI**(): `void`

Defined in: [client.ts:857](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L857)

#### Returns

`void`

***

### destroy()

> **destroy**(): `Promise`\<`void`\>

Defined in: [client.ts:863](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L863)

#### Returns

`Promise`\<`void`\>

***

### \_getTransports()

> **\_getTransports**(): [`Transport`](../interfaces/Transport.md)[]

Defined in: [client.ts:944](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L944)

**`Internal`**

Exposed for tests and the factory function

#### Returns

[`Transport`](../interfaces/Transport.md)[]
