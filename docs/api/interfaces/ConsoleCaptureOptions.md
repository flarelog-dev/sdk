[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / ConsoleCaptureOptions

# Interface: ConsoleCaptureOptions

Defined in: [types.ts:284](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L284)

Options for console hook capture

## Properties

### levels?

> `optional` **levels?**: [`ConsoleLevel`](../type-aliases/ConsoleLevel.md)[]

Defined in: [types.ts:286](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L286)

Console methods to intercept. Defaults to ["error", "warn"]

***

### source?

> `optional` **source?**: `string`

Defined in: [types.ts:288](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L288)

Source tag for captured console logs. Defaults to "console"

***

### includeArgs?

> `optional` **includeArgs?**: `boolean`

Defined in: [types.ts:290](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L290)

Include original console arguments in metadata. Defaults to true
