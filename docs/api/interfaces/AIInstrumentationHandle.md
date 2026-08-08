[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / AIInstrumentationHandle

# Interface: AIInstrumentationHandle

Defined in: [ai/index.ts:54](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/ai/index.ts#L54)

Handle returned by `flarelogAI()` — call `.dispose()` to remove all
instrumentation (restores the original fetch, etc.).

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [ai/index.ts:56](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/ai/index.ts#L56)

Remove all AI instrumentation installed by this handle.

#### Returns

`void`
