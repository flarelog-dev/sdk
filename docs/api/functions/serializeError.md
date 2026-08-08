[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / serializeError

# Function: serializeError()

> **serializeError**(`err`): `Record`\<`string`, `unknown`\>

Defined in: [errors.ts:5](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/errors.ts#L5)

Serialize an Error (or any thrown value) into a plain object safe for JSON.
Follows the Error Cause proposal (error.cause chain) for rich error context.

## Parameters

### err

`unknown`

## Returns

`Record`\<`string`, `unknown`\>
