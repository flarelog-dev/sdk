[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / ExecutionContextLike

# Interface: ExecutionContextLike

Defined in: [types.ts:355](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L355)

Execution context shape used by Cloudflare Workers and similar runtimes.
waitUntil is optional to allow graceful degradation in test/custom environments.

## Methods

### waitUntil()?

> `optional` **waitUntil**(`promise`): `void`

Defined in: [types.ts:356](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L356)

#### Parameters

##### promise

`Promise`\<`unknown`\>

#### Returns

`void`

***

### passThroughOnException()?

> `optional` **passThroughOnException**(): `void`

Defined in: [types.ts:357](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L357)

#### Returns

`void`
