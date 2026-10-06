# Other runtimes: Bun, Lambda, Netlify, containers

The SDK is built on web-standard APIs such as `fetch` and `AbortController` and imports nothing from Node's `node:` modules, so it can run wherever those exist. This page says what has been tested and what to watch for.

## Tested

- **Node.js** 22 and 24 (the full test suite runs on both in CI).
- **Bun** 1.4: the built package was run under Bun against a local OTLP endpoint. Logs are delivered with the `Authorization` and `Idempotency-Key` headers, a refused batch (HTTP 402) is dropped instead of replayed, and `createOnRequestError` works from the built bundle.
- **Cloudflare Workers**: covered by the SDK's Workers test suite.

## Not tested by us

**Deno** and **Deno Deploy** are not tested. Because the package avoids Node-only modules it may well work, but there is no evidence yet, so do not rely on it without trying it first.

## The one rule for serverless: flush before you return

AWS Lambda, Netlify Functions, Vercel Functions and similar platforms can freeze or terminate the process as soon as your handler returns. Logs still in the SDK's batch buffer are lost unless you flush first:

```typescript
import { flarelog } from "@flarelog/sdk";

const logger = flarelog({ apiKey: process.env.FLARELOG_API_KEY });

export const handler = async (event: unknown) => {
  try {
    logger.info("handling request");
    return await doWork(event);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : "handler failed");
    throw err;
  } finally {
    await logger.flush(); // before the platform freezes the process
  }
};
```

For a handler that times out, log a warning shortly before the limit so you can see where it was:

```typescript
const timer = setTimeout(() => logger.warn("close to the function time limit"), 8_000);
try {
  return await doWork(event);
} finally {
  clearTimeout(timer);
  await logger.flush();
}
```

## Containers and long-running servers

Nothing special is needed. The SDK batches in the background and flushes on an interval; call `await logger.flush()` in your shutdown handler so the final batch is sent.

## When the SDK is refused

If FlareLog rejects the API key (401/403) or your monthly quota is used up (402), the SDK warns once, drops the refused batch instead of retrying it forever, and pauses for a minute before trying again. Use the `onDrop` option to count dropped logs.
