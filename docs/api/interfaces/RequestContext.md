[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / RequestContext

# Interface: RequestContext

Defined in: [types.ts:399](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L399)

Options for request-scoped logging (Cloudflare Workers)

## Properties

### request

> **request**: `Request`

Defined in: [types.ts:401](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L401)

The incoming Request object

***

### traceId?

> `optional` **traceId?**: `string`

Defined in: [types.ts:403](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L403)

Trace ID for distributed tracing (auto-extracted from W3C traceparent if omitted)

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [types.ts:405](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L405)

Additional context metadata

***

### skipInstrumentation?

> `optional` **skipInstrumentation?**: `boolean`

Defined in: [types.ts:412](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L412)

When true, skip all instrumentation for this request — no span, no log
enrichment, no end-of-request flush. Set this from your wrapper when
you've decided the request doesn't need telemetry (e.g. favicon, static
assets, OPTIONS/HEAD preflight). The handler still runs.
