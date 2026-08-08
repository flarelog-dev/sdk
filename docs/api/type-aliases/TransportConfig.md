[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / TransportConfig

# Type Alias: TransportConfig

> **TransportConfig** = \{ `type`: `"console"`; \} \| \{ `type`: `"otlp"`; `endpoint?`: `string`; `logsEndpoint?`: `string`; `tracesEndpoint?`: `string`; `headers?`: `Record`\<`string`, `string`\>; `enableLogs?`: `boolean`; `enableTraces?`: `boolean`; \} \| \{ `type`: `"flarelog"`; `apiKey`: `string`; `endpoint?`: `string`; `enableTraces?`: `boolean`; \}

Defined in: [types.ts:239](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/types.ts#L239)

Transport configuration — used in the `transports` array.
