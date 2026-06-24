[**@flarelog/sdk**](../README.md)

***

[@flarelog/sdk](../README.md) / withVercelServerless

# Function: withVercelServerless()

> **withVercelServerless**(`logger`, `handler`): [`VercelServerlessHandler`](../type-aliases/VercelServerlessHandler.md)

Defined in: [frameworks/vercel.ts:89](https://github.com/flarelog-dev/sdk/blob/b25f63c8f94fe20fac5abbce1af1e044d5a0a23a/src/frameworks/vercel.ts#L89)

Wrap a Vercel Serverless Function handler with automatic logging and tracing.

What it does:
- Extracts or generates a `traceId` from incoming request headers
- Creates a child logger with request context (method, path, traceId)
- Attaches the child logger and traceId to `req` for downstream use
- Logs request completion with duration and status code
- Captures and logs unhandled errors before re-throwing
- Uses `res.on("finish")` to reliably capture the final status code

## Parameters

### logger

[`FlareLog`](../classes/FlareLog.md)

### handler

[`VercelServerlessHandler`](../type-aliases/VercelServerlessHandler.md)

## Returns

[`VercelServerlessHandler`](../type-aliases/VercelServerlessHandler.md)

## Examples

**Basic usage**

```typescript
// api/hello.ts
import { flarelog } from "@flarelog/sdk";
import { withVercelServerless } from "@flarelog/sdk/vercel";

const logger = flarelog({});

export default withVercelServerless(logger, async (req, res) => {
  req.logger.info("Processing request");
  res.json({ message: "Hello from Vercel!" });
});
```

**With Flarelog API key**

```typescript
// Set FLARELOG_API_KEY in Vercel project environment variables
const logger = flarelog({});
// → ships logs to your flarelog.dev dashboard
```
