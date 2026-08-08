[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / wrap

# Function: wrap()

> **wrap**\<`T`\>(`fn`, `opts`): `Promise`\<`T`\>

Defined in: [ai/index.ts:163](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/ai/index.ts#L163)

## Type Parameters

### T

`T`

## Parameters

### fn

() => `Promise`\<`T`\>

### opts

#### logger

[`FlareLog`](../classes/FlareLog.md)

#### model?

`string`

Model name (required for cost lookup if the response doesn't include it).

#### provider?

`"openai"` \| `"anthropic"` \| `"generic"` \| `"workers_ai"`

Provider name (default: "generic").

#### operation?

`"chat"` \| `"completion"` \| `"embedding"` \| `"image"` \| `"audio"` \| `"moderation"`

Operation type (default: "chat").

#### tags?

`Record`\<`string`, `string`\>

Per-call tags (attached as `flarelog.ai.tag.*` span attributes).

## Returns

`Promise`\<`T`\>
