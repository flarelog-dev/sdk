[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / FlareLogChild

# Class: FlareLogChild

Defined in: [client.ts:953](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L953)

FlareLogChild — a child logger that carries default metadata.
Logs via the parent's OTel Logger.

## Implements

- [`FlareLogLike`](../interfaces/FlareLogLike.md)

## Constructors

### Constructor

> **new FlareLogChild**(`parent`, `defaults`): `FlareLogChild`

Defined in: [client.ts:957](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L957)

#### Parameters

##### parent

[`FlareLog`](FlareLog.md)

##### defaults

`Record`\<`string`, `unknown`\> & `object`

#### Returns

`FlareLogChild`

## Methods

### trace()

> **trace**(`message`, `metadata?`): `void`

Defined in: [client.ts:965](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L965)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../interfaces/FlareLogLike.md).[`trace`](../interfaces/FlareLogLike.md#trace)

***

### debug()

> **debug**(`message`, `metadata?`): `void`

Defined in: [client.ts:966](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L966)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../interfaces/FlareLogLike.md).[`debug`](../interfaces/FlareLogLike.md#debug)

***

### info()

> **info**(`message`, `metadata?`): `void`

Defined in: [client.ts:967](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L967)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../interfaces/FlareLogLike.md).[`info`](../interfaces/FlareLogLike.md#info)

***

### warn()

> **warn**(`message`, `metadata?`): `void`

Defined in: [client.ts:968](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L968)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../interfaces/FlareLogLike.md).[`warn`](../interfaces/FlareLogLike.md#warn)

***

### error()

> **error**(`message`, `metadata?`): `void`

Defined in: [client.ts:969](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L969)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../interfaces/FlareLogLike.md).[`error`](../interfaces/FlareLogLike.md#error)

***

### fatal()

> **fatal**(`message`, `metadata?`): `void`

Defined in: [client.ts:970](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L970)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../interfaces/FlareLogLike.md).[`fatal`](../interfaces/FlareLogLike.md#fatal)

***

### log()

> **log**(`level`, `message`, `metadata?`, `opts?`): `void`

Defined in: [client.ts:972](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L972)

#### Parameters

##### level

[`LogLevel`](../type-aliases/LogLevel.md)

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

##### opts?

###### source?

`string`

###### traceId?

`string`

###### spanId?

`string`

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../interfaces/FlareLogLike.md).[`log`](../interfaces/FlareLogLike.md#log)

***

### logError()

> **logError**(`err`, `opts?`): `void`

Defined in: [client.ts:976](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L976)

#### Parameters

##### err

`unknown`

##### opts?

###### message?

`string`

###### level?

[`LogLevel`](../type-aliases/LogLevel.md)

###### source?

`string`

###### metadata?

`Record`\<`string`, `unknown`\>

###### traceId?

`string`

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../interfaces/FlareLogLike.md).[`logError`](../interfaces/FlareLogLike.md#logerror)

***

### addBreadcrumb()

> **addBreadcrumb**(`breadcrumb`): `void`

Defined in: [client.ts:980](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L980)

#### Parameters

##### breadcrumb

`Omit`\<[`Breadcrumb`](../interfaces/Breadcrumb.md), `"timestamp"`\>

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../interfaces/FlareLogLike.md).[`addBreadcrumb`](../interfaces/FlareLogLike.md#addbreadcrumb)

***

### setUser()

> **setUser**(`user`): `void`

Defined in: [client.ts:981](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L981)

#### Parameters

##### user

[`UserContext`](../interfaces/UserContext.md) \| `null`

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../interfaces/FlareLogLike.md).[`setUser`](../interfaces/FlareLogLike.md#setuser)

***

### setTag()

> **setTag**(`key`, `value`): `void`

Defined in: [client.ts:982](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L982)

#### Parameters

##### key

`string`

##### value

`string`

#### Returns

`void`

#### Implementation of

[`FlareLogLike`](../interfaces/FlareLogLike.md).[`setTag`](../interfaces/FlareLogLike.md#settag)

***

### flush()

> **flush**(): `Promise`\<`void`\>

Defined in: [client.ts:983](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L983)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`FlareLogLike`](../interfaces/FlareLogLike.md).[`flush`](../interfaces/FlareLogLike.md#flush)

***

### child()

> **child**(`defaults`): `FlareLogChild`

Defined in: [client.ts:984](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/client.ts#L984)

#### Parameters

##### defaults

`Record`\<`string`, `unknown`\> & `object`

#### Returns

`FlareLogChild`

#### Implementation of

[`FlareLogLike`](../interfaces/FlareLogLike.md).[`child`](../interfaces/FlareLogLike.md#child)
