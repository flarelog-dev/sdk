[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / LogEntry

# Interface: LogEntry

Defined in: [types.ts:16](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L16)

A single log entry — backwards-compatible with v1, now with OTel-friendly
optional fields.

## Extended by

- [`QueuedLog`](QueuedLog.md)

## Properties

### timestamp?

> `optional` **timestamp?**: `string`

Defined in: [types.ts:18](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L18)

ISO 8601 timestamp. Defaults to current time if not provided.

***

### level

> **level**: [`LogLevel`](../type-aliases/LogLevel.md)

Defined in: [types.ts:20](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L20)

Log severity level

***

### message

> **message**: `string`

Defined in: [types.ts:22](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L22)

Log message body

***

### source?

> `optional` **source?**: `string`

Defined in: [types.ts:24](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L24)

Source identifier (e.g., function name, route)

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [types.ts:26](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L26)

Arbitrary structured metadata

***

### traceId?

> `optional` **traceId?**: `string`

Defined in: [types.ts:28](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L28)

Trace ID for distributed tracing (W3C, 32 hex chars)

***

### spanId?

> `optional` **spanId?**: `string`

Defined in: [types.ts:30](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L30)

Span ID for distributed tracing (W3C, 16 hex chars)
