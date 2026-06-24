[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / CaptureOptions

# Interface: CaptureOptions

Defined in: [types.ts:220](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L220)

Options for error capture methods

## Properties

### source?

> `optional` **source?**: `string`

Defined in: [types.ts:222](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L222)

Override the source tag for this capture

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [types.ts:224](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L224)

Additional metadata to attach to error logs

***

### level?

> `optional` **level?**: `"WARN"` \| `"ERROR"` \| `"FATAL"`

Defined in: [types.ts:226](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L226)

Custom log level for captured errors. Defaults to "ERROR"

***

### rethrow?

> `optional` **rethrow?**: `boolean`

Defined in: [types.ts:228](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L228)

Whether to re-throw the error after logging. Defaults to true

***

### label?

> `optional` **label?**: `string`

Defined in: [types.ts:230](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L230)

A descriptive label for what operation was being attempted
