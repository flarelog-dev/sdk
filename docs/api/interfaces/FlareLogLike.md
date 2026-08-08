[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / FlareLogLike

# Interface: FlareLogLike

Defined in: [types.ts:321](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L321)

Logger interface used by internal capture modules.

## Methods

### trace()

> **trace**(`message`, `metadata?`): `void`

Defined in: [types.ts:322](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L322)

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

Defined in: [types.ts:323](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L323)

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

Defined in: [types.ts:324](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L324)

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

Defined in: [types.ts:325](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L325)

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

Defined in: [types.ts:326](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L326)

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

Defined in: [types.ts:327](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L327)

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

Defined in: [types.ts:328](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L328)

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

Defined in: [types.ts:334](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L334)

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

Defined in: [types.ts:344](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L344)

#### Parameters

##### breadcrumb

`Omit`\<[`Breadcrumb`](Breadcrumb.md), `"timestamp"`\>

#### Returns

`void`

***

### setUser()

> **setUser**(`user`): `void`

Defined in: [types.ts:345](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L345)

#### Parameters

##### user

[`UserContext`](UserContext.md) \| `null`

#### Returns

`void`

***

### setTag()

> **setTag**(`key`, `value`): `void`

Defined in: [types.ts:346](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L346)

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

Defined in: [types.ts:347](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L347)

#### Returns

`Promise`\<`void`\>

***

### child()

> **child**(`defaults`): `FlareLogLike`

Defined in: [types.ts:348](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L348)

#### Parameters

##### defaults

`Record`\<`string`, `unknown`\> & `object`

#### Returns

`FlareLogLike`
