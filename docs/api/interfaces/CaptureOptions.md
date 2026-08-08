[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / CaptureOptions

# Interface: CaptureOptions

Defined in: [types.ts:305](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L305)

Options for error capture methods

## Properties

### source?

> `optional` **source?**: `string`

Defined in: [types.ts:307](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L307)

Override the source tag for this capture

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [types.ts:309](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L309)

Additional metadata to attach to error logs

***

### level?

> `optional` **level?**: `"WARN"` \| `"ERROR"` \| `"FATAL"`

Defined in: [types.ts:311](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L311)

Custom log level for captured errors. Defaults to "ERROR"

***

### rethrow?

> `optional` **rethrow?**: `boolean`

Defined in: [types.ts:313](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L313)

Whether to re-throw the error after logging. Defaults to true

***

### label?

> `optional` **label?**: `string`

Defined in: [types.ts:315](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L315)

A descriptive label for what operation was being attempted
