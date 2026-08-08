[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / WorkerFetchHandler

# Type Alias: WorkerFetchHandler\<T\>

> **WorkerFetchHandler**\<`T`\> = (`request`, `env`, `ctx`) => `Promise`\<`T`\>

Defined in: [types.ts:390](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L390)

Cloudflare Worker fetch handler signature

## Type Parameters

### T

`T` = `Response`

## Parameters

### request

`Request`

### env

`unknown`

### ctx

[`ExecutionContextLike`](../interfaces/ExecutionContextLike.md)

## Returns

`Promise`\<`T`\>
