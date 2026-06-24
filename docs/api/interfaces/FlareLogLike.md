[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / FlareLogLike

# Interface: FlareLogLike

Defined in: [types.ts:236](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L236)

Logger interface used by internal capture modules.

## Methods

### trace()

> **trace**(`message`, `metadata?`): `void`

Defined in: [types.ts:237](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L237)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### debug()

> **debug**(`message`, `metadata?`): `void`

Defined in: [types.ts:238](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L238)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### info()

> **info**(`message`, `metadata?`): `void`

Defined in: [types.ts:239](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L239)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### warn()

> **warn**(`message`, `metadata?`): `void`

Defined in: [types.ts:240](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L240)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### error()

> **error**(`message`, `metadata?`): `void`

Defined in: [types.ts:241](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L241)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### fatal()

> **fatal**(`message`, `metadata?`): `void`

Defined in: [types.ts:242](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L242)

#### Parameters

##### message

`string`

##### metadata?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### log()

> **log**(`level`, `message`, `metadata?`, `opts?`): `void`

Defined in: [types.ts:243](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L243)

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

***

### logError()

> **logError**(`err`, `opts?`): `void`

Defined in: [types.ts:249](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L249)

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

***

### addBreadcrumb()

> **addBreadcrumb**(`breadcrumb`): `void`

Defined in: [types.ts:259](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L259)

#### Parameters

##### breadcrumb

`Omit`\<[`Breadcrumb`](Breadcrumb.md), `"timestamp"`\>

#### Returns

`void`

***

### setUser()

> **setUser**(`user`): `void`

Defined in: [types.ts:260](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L260)

#### Parameters

##### user

[`UserContext`](UserContext.md) \| `null`

#### Returns

`void`

***

### setTag()

> **setTag**(`key`, `value`): `void`

Defined in: [types.ts:261](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L261)

#### Parameters

##### key

`string`

##### value

`string`

#### Returns

`void`

***

### flush()

> **flush**(): `Promise`\<`void`\>

Defined in: [types.ts:262](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L262)

#### Returns

`Promise`\<`void`\>

***

### child()

> **child**(`defaults`): `FlareLogLike`

Defined in: [types.ts:263](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L263)

#### Parameters

##### defaults

`Record`\<`string`, `unknown`\> & `object`

#### Returns

`FlareLogLike`
