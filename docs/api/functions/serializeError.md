[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / serializeError

# Function: serializeError()

> **serializeError**(`err`): `Record`\<`string`, `unknown`\>

Defined in: [errors.ts:5](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/errors.ts#L5)

Serialize an Error (or any thrown value) into a plain object safe for JSON.
Follows the Error Cause proposal (error.cause chain) for rich error context.

## Parameters

### err

`unknown`

## Returns

`Record`\<`string`, `unknown`\>
