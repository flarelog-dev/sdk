[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / ConsoleCaptureOptions

# Interface: ConsoleCaptureOptions

Defined in: [types.ts:199](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L199)

Options for console hook capture

## Properties

### levels?

> `optional` **levels?**: [`ConsoleLevel`](../type-aliases/ConsoleLevel.md)[]

Defined in: [types.ts:201](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L201)

Console methods to intercept. Defaults to ["error", "warn"]

***

### source?

> `optional` **source?**: `string`

Defined in: [types.ts:203](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L203)

Source tag for captured console logs. Defaults to "console"

***

### includeArgs?

> `optional` **includeArgs?**: `boolean`

Defined in: [types.ts:205](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L205)

Include original console arguments in metadata. Defaults to true
