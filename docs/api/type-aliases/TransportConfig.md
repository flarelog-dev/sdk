[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / TransportConfig

# Type Alias: TransportConfig

> **TransportConfig** = \{ `type`: `"console"`; \} \| \{ `type`: `"otlp"`; `endpoint?`: `string`; `logsEndpoint?`: `string`; `tracesEndpoint?`: `string`; `headers?`: `Record`\<`string`, `string`\>; `enableLogs?`: `boolean`; `enableTraces?`: `boolean`; \} \| \{ `type`: `"flarelog"`; `apiKey`: `string`; `endpoint?`: `string`; `enableTraces?`: `boolean`; \}

Defined in: [types.ts:154](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/types.ts#L154)

Transport configuration — used in the `transports` array.
