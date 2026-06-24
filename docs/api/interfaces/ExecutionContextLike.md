[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / ExecutionContextLike

# Interface: ExecutionContextLike

Defined in: [types.ts:270](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L270)

Execution context shape used by Cloudflare Workers and similar runtimes.
waitUntil is optional to allow graceful degradation in test/custom environments.

## Methods

### waitUntil()?

> `optional` **waitUntil**(`promise`): `void`

Defined in: [types.ts:271](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L271)

#### Parameters

##### promise

`Promise`\<`unknown`\>

#### Returns

`void`

***

### passThroughOnException()?

> `optional` **passThroughOnException**(): `void`

Defined in: [types.ts:272](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L272)

#### Returns

`void`
