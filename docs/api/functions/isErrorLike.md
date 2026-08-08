[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / isErrorLike

# Function: isErrorLike()

> **isErrorLike**(`val`): `val is { name: string; message: string; stack?: string }`

Defined in: [errors.ts:52](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/errors.ts#L52)

Check if a value looks like an Error instance (duck typing for cross-realm).

## Parameters

### val

`unknown`

## Returns

`val is { name: string; message: string; stack?: string }`
