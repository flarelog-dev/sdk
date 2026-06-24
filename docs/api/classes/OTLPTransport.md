[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / OTLPTransport

# Class: OTLPTransport

Defined in: [otel/otlp-transport.ts:53](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/otlp-transport.ts#L53)

OTLPTransport — ships telemetry to any OTLP/HTTP JSON endpoint.

Works with Grafana Cloud, Honeycomb, Tempo, Jaeger, Datadog (OTLP ingest),
self-hosted collectors, or any backend that accepts OTLP/HTTP JSON.

## Example

```ts
new OTLPTransport({
  endpoint: "https://otlp-gateway-prod-eu-west-0.grafana.net",
  headers: {
    Authorization: "Basic " + btoa(`${GRAFANA_INSTANCE_ID}:${GRAFANA_API_KEY}`),
  },
})
```

## Implements

- [`Transport`](../interfaces/Transport.md)

## Constructors

### Constructor

> **new OTLPTransport**(`config?`): `OTLPTransport`

Defined in: [otel/otlp-transport.ts:64](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/otlp-transport.ts#L64)

#### Parameters

##### config?

`OTLPTransportConfig` = `{}`

#### Returns

`OTLPTransport`

## Properties

### name

> `readonly` **name**: `"otlp"` = `"otlp"`

Defined in: [otel/otlp-transport.ts:54](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/otlp-transport.ts#L54)

Human-readable name for debug logging.

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`name`](../interfaces/Transport.md#name)

## Methods

### exportLogs()

> **exportLogs**(`logs`): `Promise`\<`void`\>

Defined in: [otel/otlp-transport.ts:78](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/otlp-transport.ts#L78)

Called by the LogRecordProcessor when a log record is emitted.

#### Parameters

##### logs

`ReadableLogRecord`[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`exportLogs`](../interfaces/Transport.md#exportlogs)

***

### exportSpans()

> **exportSpans**(`spans`): `Promise`\<`void`\>

Defined in: [otel/otlp-transport.ts:84](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/otlp-transport.ts#L84)

Called by the SpanProcessor when a span ends.

#### Parameters

##### spans

`ReadableSpan`[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`exportSpans`](../interfaces/Transport.md#exportspans)

***

### flush()

> **flush**(): `Promise`\<`void`\>

Defined in: [otel/otlp-transport.ts:131](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/otlp-transport.ts#L131)

Force-flush any in-flight batches. Called on ctx.waitUntil().

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`flush`](../interfaces/Transport.md#flush)

***

### shutdown()

> **shutdown**(): `Promise`\<`void`\>

Defined in: [otel/otlp-transport.ts:136](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/otlp-transport.ts#L136)

Release resources (timers, connections).

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`shutdown`](../interfaces/Transport.md#shutdown)
