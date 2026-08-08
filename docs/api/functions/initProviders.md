[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / initProviders

# Function: initProviders()

> **initProviders**(`opts`): `object`

Defined in: [otel/providers.ts:298](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/otel/providers.ts#L298)

## Parameters

### opts

`ProviderOptions`

## Returns

`object`

### tracerProvider

> **tracerProvider**: `TracerProvider`

### loggerProvider

> **loggerProvider**: `LoggerProvider`

### flush

> **flush**: () => `Promise`\<`void`\>

#### Returns

`Promise`\<`void`\>

### shutdown

> **shutdown**: () => `Promise`\<`void`\>

#### Returns

`Promise`\<`void`\>
