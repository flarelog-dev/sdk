[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / FlareLogChild

# Class: FlareLogChild

Defined in: [client.ts:772](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L772)

FlareLogChild — a child logger that carries default metadata.
Logs via the parent's OTel Logger.

## Implements

- [`FlareLogLike`](../interfaces/FlareLogLike.md)

## Constructors

### Constructor

> **new FlareLogChild**(`parent`, `defaults`): `FlareLogChild`

Defined in: [client.ts:776](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L776)

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

Defined in: [client.ts:784](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L784)

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

Defined in: [client.ts:785](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L785)

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

Defined in: [client.ts:786](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L786)

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

Defined in: [client.ts:787](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L787)

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

Defined in: [client.ts:788](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L788)

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

Defined in: [client.ts:789](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L789)

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

Defined in: [client.ts:791](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L791)

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

Defined in: [client.ts:795](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L795)

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

Defined in: [client.ts:799](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L799)

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

Defined in: [client.ts:800](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L800)

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

Defined in: [client.ts:801](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L801)

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

Defined in: [client.ts:802](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L802)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`FlareLogLike`](../interfaces/FlareLogLike.md).[`flush`](../interfaces/FlareLogLike.md#flush)

***

### child()

> **child**(`defaults`): `FlareLogChild`

Defined in: [client.ts:803](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/client.ts#L803)

#### Parameters

##### defaults

`Record`\<`string`, `unknown`\> & `object`

#### Returns

`FlareLogChild`

#### Implementation of

[`FlareLogLike`](../interfaces/FlareLogLike.md).[`child`](../interfaces/FlareLogLike.md#child)
