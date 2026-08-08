[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / wrapClient

# Function: wrapClient()

> **wrapClient**\<`T`\>(`client`): `T`

Defined in: [ai/index.ts:153](https://github.com/flarelog-dev/sdk/blob/5f9e53e5dc4a36dd2f648837fb2d65294f8414f2/src/ai/index.ts#L153)

Re-route an AI SDK client's internal `fetch` through `globalThis.fetch`.

Both the OpenAI SDK (`openai` v4+) and the Anthropic SDK
(`@anthropic-ai/sdk`) capture `globalThis.fetch` at construction time
and cache it on `client.fetch` for the instance's lifetime. If the
client was constructed before `@flarelog/sdk/ai` was imported, it holds
a reference to the raw native fetch and bypasses all instrumentation.

This function patches `client.fetch` to delegate to `globalThis.fetch`
(which is flarelog's inert wrapper). Call it after `flarelogAI()`:

## Type Parameters

### T

`T` *extends* `object`

## Parameters

### client

`T`

## Returns

`T`

## Example

```ts
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { flarelogAI, wrapClient } from "@flarelog/sdk/ai";

// Clients constructed early (e.g. at module scope in lib/ai.ts):
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Activate instrumentation:
flarelogAI(logger);
wrapClient(openai);      // re-routes client.fetch → globalThis.fetch
wrapClient(anthropic);   // same — works for any client with .fetch
```

**Not needed** if the client is constructed after `import "@flarelog/sdk/ai"`.
