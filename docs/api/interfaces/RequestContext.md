[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / RequestContext

# Interface: RequestContext

Defined in: [types.ts:287](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L287)

Options for request-scoped logging (Cloudflare Workers)

## Properties

### request

> **request**: `Request`

Defined in: [types.ts:289](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L289)

The incoming Request object

***

### traceId?

> `optional` **traceId?**: `string`

Defined in: [types.ts:291](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L291)

Trace ID for distributed tracing (auto-extracted from W3C traceparent if omitted)

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [types.ts:293](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L293)

Additional context metadata
