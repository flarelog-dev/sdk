[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / AIInstrumentationConfig

# Interface: AIInstrumentationConfig

Defined in: [ai/types.ts:143](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/ai/types.ts#L143)

Configuration for the AI observability module.

## Properties

### autoFetch?

> `optional` **autoFetch?**: `boolean`

Defined in: [ai/types.ts:148](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/ai/types.ts#L148)

Whether to auto-patch global `fetch()` to intercept AI calls.
Default: `true`. Set to `false` if you only want explicit `wrap()`.

***

### propagateTrace?

> `optional` **propagateTrace?**: `boolean`

Defined in: [ai/types.ts:155](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/ai/types.ts#L155)

Whether to inject the W3C traceparent header on outgoing AI calls.
Default: `true`. Lets you correlate AI spans with their parent request
span across service boundaries.

***

### captureSamples?

> `optional` **captureSamples?**: `boolean`

Defined in: [ai/types.ts:162](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/ai/types.ts#L162)

Whether to capture truncated prompt/completion samples.
Default: `false` (privacy-preserving). When enabled, captures the first
`maxPromptSampleChars` of the prompt and completion as span attributes.

***

### maxPromptSampleChars?

> `optional` **maxPromptSampleChars?**: `number`

Defined in: [ai/types.ts:165](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/ai/types.ts#L165)

Max characters of prompt/completion to capture when `captureSamples` is on. Default: 500.

***

### priceOverrides?

> `optional` **priceOverrides?**: `Record`\<`string`, `PriceEntry`\>

Defined in: [ai/types.ts:172](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/ai/types.ts#L172)

Custom price table overrides. Merged with the built-in table.
Key is the model name (exact match, case-insensitive).
Value is USD per 1M tokens for each token category.

***

### costMultiplier?

> `optional` **costMultiplier?**: `number`

Defined in: [ai/types.ts:179](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/ai/types.ts#L179)

Multiplier applied to all computed costs. Useful for baked-in margin
or for tracking internal transfer cost vs customer-facing price.
Default: 1.0.

***

### sampleRate?

> `optional` **sampleRate?**: `number`

Defined in: [ai/types.ts:186](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/ai/types.ts#L186)

Sample rate for AI spans (0.0 to 1.0). Independent of the logger's
global `sampleRate` so you can capture 100% of AI calls while sampling
other logs. Default: 1.0.

***

### shouldInstrument?

> `optional` **shouldInstrument?**: (`url`, `method`) => `boolean`

Defined in: [ai/types.ts:192](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/ai/types.ts#L192)

Filter function — return false to skip instrumentation for a request.
Useful for excluding internal/healthcheck calls.

#### Parameters

##### url

`string`

##### method

`string`

#### Returns

`boolean`

***

### extraProviderHosts?

> `optional` **extraProviderHosts?**: `object`[]

Defined in: [ai/types.ts:199](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/ai/types.ts#L199)

List of additional hostname patterns to recognize as AI providers.
Each entry can be a string (substring match) or RegExp.
Useful for OpenAI-compatible gateways (e.g. Together, Groq, Anyscale).

#### pattern

> **pattern**: `string` \| `RegExp`

#### provider

> **provider**: `string`
