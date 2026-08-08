[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / FlarelogTransport

# Class: FlarelogTransport

Defined in: [otel/flarelog-transport.ts:32](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/otel/flarelog-transport.ts#L32)

FlarelogTransport — ships telemetry to Flarelog's hosted backend.

This is the GATED, monetized path. The SDK itself is free and open source,
but Flarelog's hosted dashboard, AI analysis, and long-term storage require
an API key. Users without a key still get the full SDK with console output
and/or OTLP export to any other backend.

The Flarelog backend accepts standard OTLP/HTTP JSON at /api/v1/logs and
/api/v1/traces, plus the legacy /api/trpc/log.ingest endpoint for v1 clients.

## Implements

- [`Transport`](../interfaces/Transport.md)

## Constructors

### Constructor

> **new FlarelogTransport**(`config`): `FlarelogTransport`

Defined in: [otel/flarelog-transport.ts:42](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/otel/flarelog-transport.ts#L42)

#### Parameters

##### config

`FlarelogTransportConfig`

#### Returns

`FlarelogTransport`

## Properties

### name

> `readonly` **name**: `"flarelog"` = `"flarelog"`

Defined in: [otel/flarelog-transport.ts:33](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/otel/flarelog-transport.ts#L33)

Human-readable name for debug logging.

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`name`](../interfaces/Transport.md#name)

## Methods

### exportLogs()

> **exportLogs**(`logs`): `Promise`\<`void`\>

Defined in: [otel/flarelog-transport.ts:63](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/otel/flarelog-transport.ts#L63)

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

Defined in: [otel/flarelog-transport.ts:69](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/otel/flarelog-transport.ts#L69)

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

Defined in: [otel/flarelog-transport.ts:123](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/otel/flarelog-transport.ts#L123)

Force-flush any in-flight batches. Called on ctx.waitUntil().

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`flush`](../interfaces/Transport.md#flush)

***

### shutdown()

> **shutdown**(): `Promise`\<`void`\>

Defined in: [otel/flarelog-transport.ts:127](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/otel/flarelog-transport.ts#L127)

Release resources (timers, connections).

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`shutdown`](../interfaces/Transport.md#shutdown)
