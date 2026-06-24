[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / Transport

# Interface: Transport

Defined in: [otel/transport.ts:15](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/transport.ts#L15)

A Transport is responsible for delivering telemetry to a backend.

The SDK fans out log records and spans to all configured transports.
Each transport owns its own batching, retries, and HTTP delivery.

Implementations:
- ConsoleTransport: pretty-prints to console (dev mode)
- OTLPTransport: ships OTLP/HTTP JSON to any OTel backend
- FlarelogTransport: ships to flarelog.dev (proprietary, optional via apiKey)

## Properties

### name

> `readonly` **name**: `string`

Defined in: [otel/transport.ts:17](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/transport.ts#L17)

Human-readable name for debug logging.

## Methods

### exportLogs()

> **exportLogs**(`logs`): `Promise`\<`void`\>

Defined in: [otel/transport.ts:20](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/transport.ts#L20)

Called by the LogRecordProcessor when a log record is emitted.

#### Parameters

##### logs

`ReadableLogRecord`[]

#### Returns

`Promise`\<`void`\>

***

### exportSpans()

> **exportSpans**(`spans`): `Promise`\<`void`\>

Defined in: [otel/transport.ts:23](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/transport.ts#L23)

Called by the SpanProcessor when a span ends.

#### Parameters

##### spans

`ReadableSpan`[]

#### Returns

`Promise`\<`void`\>

***

### flush()

> **flush**(): `Promise`\<`void`\>

Defined in: [otel/transport.ts:26](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/transport.ts#L26)

Force-flush any in-flight batches. Called on ctx.waitUntil().

#### Returns

`Promise`\<`void`\>

***

### shutdown()

> **shutdown**(): `Promise`\<`void`\>

Defined in: [otel/transport.ts:29](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/transport.ts#L29)

Release resources (timers, connections).

#### Returns

`Promise`\<`void`\>
