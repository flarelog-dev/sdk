[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / flarelogAI

# Function: flarelogAI()

> **flarelogAI**(`logger`, `config?`): [`AIInstrumentationHandle`](../interfaces/AIInstrumentationHandle.md)

Defined in: [ai/index.ts:76](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/ai/index.ts#L76)

Enable AI inference observability on a FlareLog instance.

By default, this:
 - Patches `globalThis.fetch` to intercept calls to OpenAI, Anthropic,
   and any user-configured extra hosts.
 - Injects the W3C traceparent header on outgoing AI calls so they
   correlate with the parent request span.
 - Captures token usage, latency (TTFB + total), cost in USD, tool calls,
   and errors.
 - Emits a structured log entry per call with `flarelog.kind: "ai_call"`.

The instrumentation is global — calling `flarelogAI(logger)` twice with
different loggers is undefined. Use one logger per process.

## Parameters

### logger

[`FlareLog`](../classes/FlareLog.md)

### config?

[`AIInstrumentationConfig`](../interfaces/AIInstrumentationConfig.md) = `{}`

## Returns

[`AIInstrumentationHandle`](../interfaces/AIInstrumentationHandle.md)

a handle with a `.dispose()` method to remove instrumentation.
