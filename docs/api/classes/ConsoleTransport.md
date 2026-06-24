[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / ConsoleTransport

# Class: ConsoleTransport

Defined in: [otel/console-transport.ts:75](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/console-transport.ts#L75)

ConsoleTransport — pretty-prints telemetry to stdout/stderr.

This is the default when no API key and no OTLP endpoint are configured.
Lets developers see exactly what would be shipped without any backend setup.

## Implements

- [`Transport`](../interfaces/Transport.md)

## Constructors

### Constructor

> **new ConsoleTransport**(): `ConsoleTransport`

#### Returns

`ConsoleTransport`

## Properties

### name

> `readonly` **name**: `"console"` = `"console"`

Defined in: [otel/console-transport.ts:76](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/console-transport.ts#L76)

Human-readable name for debug logging.

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`name`](../interfaces/Transport.md#name)

## Methods

### exportLogs()

> **exportLogs**(`logs`): `Promise`\<`void`\>

Defined in: [otel/console-transport.ts:78](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/console-transport.ts#L78)

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

Defined in: [otel/console-transport.ts:95](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/console-transport.ts#L95)

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

Defined in: [otel/console-transport.ts:104](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/console-transport.ts#L104)

Force-flush any in-flight batches. Called on ctx.waitUntil().

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`flush`](../interfaces/Transport.md#flush)

***

### shutdown()

> **shutdown**(): `Promise`\<`void`\>

Defined in: [otel/console-transport.ts:108](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/console-transport.ts#L108)

Release resources (timers, connections).

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Transport`](../interfaces/Transport.md).[`shutdown`](../interfaces/Transport.md#shutdown)
