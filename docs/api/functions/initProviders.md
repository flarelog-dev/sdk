[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / initProviders

# Function: initProviders()

> **initProviders**(`opts`): `object`

Defined in: [otel/providers.ts:173](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/otel/providers.ts#L173)

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
