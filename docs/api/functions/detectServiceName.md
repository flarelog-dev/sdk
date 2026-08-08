[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / detectServiceName

# Function: detectServiceName()

> **detectServiceName**(): `string`

Defined in: [otel/env.ts:178](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/otel/env.ts#L178)

Auto-detect `service.name` if not explicitly provided.
Uses package name, worker name, or falls back to "unknown_service".

## Returns

`string`
