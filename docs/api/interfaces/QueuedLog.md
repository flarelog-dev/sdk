[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / QueuedLog

# Interface: QueuedLog

Defined in: [types.ts:299](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L299)

Internal queued log with resolved timestamp (kept for backwards compat).

## Extends

- [`LogEntry`](LogEntry.md)

## Properties

### level

> **level**: [`LogLevel`](../type-aliases/LogLevel.md)

Defined in: [types.ts:20](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L20)

Log severity level

#### Inherited from

[`LogEntry`](LogEntry.md).[`level`](LogEntry.md#level)

***

### message

> **message**: `string`

Defined in: [types.ts:22](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L22)

Log message body

#### Inherited from

[`LogEntry`](LogEntry.md).[`message`](LogEntry.md#message)

***

### source?

> `optional` **source?**: `string`

Defined in: [types.ts:24](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L24)

Source identifier (e.g., function name, route)

#### Inherited from

[`LogEntry`](LogEntry.md).[`source`](LogEntry.md#source)

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [types.ts:26](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L26)

Arbitrary structured metadata

#### Inherited from

[`LogEntry`](LogEntry.md).[`metadata`](LogEntry.md#metadata)

***

### traceId?

> `optional` **traceId?**: `string`

Defined in: [types.ts:28](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L28)

Trace ID for distributed tracing (W3C, 32 hex chars)

#### Inherited from

[`LogEntry`](LogEntry.md).[`traceId`](LogEntry.md#traceid)

***

### spanId?

> `optional` **spanId?**: `string`

Defined in: [types.ts:30](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L30)

Span ID for distributed tracing (W3C, 16 hex chars)

#### Inherited from

[`LogEntry`](LogEntry.md).[`spanId`](LogEntry.md#spanid)

***

### timestamp

> **timestamp**: `string`

Defined in: [types.ts:300](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L300)

ISO 8601 timestamp. Defaults to current time if not provided.

#### Overrides

[`LogEntry`](LogEntry.md).[`timestamp`](LogEntry.md#timestamp)
