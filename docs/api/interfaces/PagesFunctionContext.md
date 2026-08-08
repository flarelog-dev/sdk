[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / PagesFunctionContext

# Interface: PagesFunctionContext

Defined in: [types.ts:365](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L365)

Cloudflare Pages Function context shape (used in `functions/` directory).
This is the context object passed to `onRequest` handlers in Pages Functions.
Pages Functions run on the same Workers runtime but have a different API shape.

## Properties

### request

> **request**: `Request`

Defined in: [types.ts:367](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L367)

The incoming Request object

***

### env

> **env**: `Record`\<`string`, `unknown`\>

Defined in: [types.ts:369](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L369)

Environment variables and bindings (KV, D1, R2, etc.)

***

### waitUntil

> **waitUntil**: (`promise`) => `void`

Defined in: [types.ts:371](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L371)

Wait until a promise resolves before the function ends

#### Parameters

##### promise

`Promise`\<`unknown`\>

#### Returns

`void`

***

### next?

> `optional` **next?**: () => `Promise`\<`Response`\>

Defined in: [types.ts:373](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L373)

Next function in the middleware chain (if using middleware)

#### Returns

`Promise`\<`Response`\>

***

### data?

> `optional` **data?**: `Record`\<`string`, `unknown`\>

Defined in: [types.ts:375](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L375)

Data passed between middlewares

***

### params?

> `optional` **params?**: `Record`\<`string`, `string`\>

Defined in: [types.ts:377](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L377)

Function parameters from dynamic routes
