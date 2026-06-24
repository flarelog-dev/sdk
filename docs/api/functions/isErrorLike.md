[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / isErrorLike

# Function: isErrorLike()

> **isErrorLike**(`val`): `val is { name: string; message: string; stack?: string }`

Defined in: [errors.ts:52](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/errors.ts#L52)

Check if a value looks like an Error instance (duck typing for cross-realm).

## Parameters

### val

`unknown`

## Returns

`val is { name: string; message: string; stack?: string }`
