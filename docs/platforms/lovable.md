# FlareLog SDK - Lovable Guide

[Lovable](https://lovable.dev) generates full-stack TanStack Start apps that
deploy to **Cloudflare Workers** (not static hosting). Since May 2025 every
new Lovable project uses this stack by default — see Lovable's
[Building apps using TanStack Start](https://lovable.dev/blog/building-apps-using-tanstack-start)
announcement for the full architecture.

This matters for FlareLog because the runtime determines how secrets reach
your code. On Workers, `process.env.FLARELOG_API_KEY` is **undefined** at
module load. Secrets are injected as `env` bindings on the request event.
If you instantiate the logger eagerly with `flarelog({ apiKey:
process.env.FLARELOG_API_KEY! })`, the SDK silently falls back to
`ConsoleTransport` and nothing ships to your dashboard.

This guide shows the correct pattern for Lovable preview and production
builds.

## TL;DR

```typescript
// src/start.ts
import { createStart } from "@tanstack/react-start";
import { flarelog, type FlareLog } from "@flarelog/sdk";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";
import { getEvent } from "vinxi/http";

let _logger: FlareLog | null = null;

function getLogger(): FlareLog {
  if (_logger) return _logger;

  const event = getEvent() as unknown as {
    cloudflare?: { env?: Record<string, string | undefined> };
    context?: { cloudflare?: { env?: Record<string, string | undefined> } };
  };
  const env =
    event?.cloudflare?.env ??
    event?.context?.cloudflare?.env ??
    process.env; // local dev fallback

  _logger = flarelog({
    apiKey: env.FLARELOG_API_KEY,
    environment: env.FLARELOG_ENVIRONMENT ?? "production",
    release: env.FLARELOG_RELEASE,
    workerMode: true, // critical: batchSize=1, flushIntervalMs=0
  });
  return _logger;
}

export const startInstance = createStart(() => ({
  requestMiddleware: [tanstackStartMiddleware(getLogger) as never],
}));
```

## Why the lazy pattern is required

Lovable's new stack runs your app as a single Cloudflare Worker. The runtime
characteristics are:

1. **Secrets are bindings, not env vars.** Lovable stores your `FLARELOG_API_KEY`
   in its dashboard and injects it as a Worker binding at request time. It is
   **not** present on `process.env` at module load.
2. **The Worker is short-lived.** Without `workerMode: true`, the SDK uses the
   default Node-style batch processor (`batchSize: 50`, `flushIntervalMs: 5000`).
   The Worker will be suspended before the timer fires, dropping all buffered
   logs.
3. **No `ctx.waitUntil` from the middleware layer.** TanStack Start's
   `createMiddleware().server(...)` does not expose the Worker's
   `ExecutionContext`. The middleware instead calls `await logger.flush()`
   after each request to force delivery before the Worker returns.

The factory pattern solves (1) by deferring logger creation until the request
arrives, at which point `getEvent()` from `vinxi/http` can read the per-request
`env`. Setting `workerMode: true` solves (2). The flush call inside
`tanstackStartMiddleware` solves (3).

## Step-by-step setup

### 1. Install the SDK

In Lovable's editor, ask the AI to install the package, or add it to
`package.json` manually:

```bash
npm install @flarelog/sdk
```

`@tanstack/react-start` is already a dependency of every Lovable project — no
need to install it separately.

### 2. Add your FlareLog API key in Lovable

In your Lovable project settings, under **Secrets / Environment variables**,
add:

| Name | Value |
|------|-------|
| `FLARELOG_API_KEY` | `fl_your_key` |

Do **not** prefix it with `VITE_`. The `VITE_` prefix pushes the value into
the client bundle, which leaks your key to the browser. Server-only secrets
(without the prefix) are injected as Worker bindings and never reach the
client.

### 3. Create `src/start.ts`

Use the TL;DR snippet above. If `src/start.ts` already exists (Lovable
generates one with CSRF middleware), merge the two:

```typescript
import { createStart, createCsrfMiddleware } from "@tanstack/react-start";
import { flarelog, type FlareLog } from "@flarelog/sdk";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";
import { getEvent } from "vinxi/http";

let _logger: FlareLog | null = null;
function getLogger(): FlareLog {
  if (_logger) return _logger;
  const event = getEvent() as unknown as {
    cloudflare?: { env?: Record<string, string | undefined> };
    context?: { cloudflare?: { env?: Record<string, string | undefined> } };
  };
  const env =
    event?.cloudflare?.env ??
    event?.context?.cloudflare?.env ??
    process.env;
  _logger = flarelog({
    apiKey: env.FLARELOG_API_KEY,
    environment: env.FLARELOG_ENVIRONMENT ?? "production",
    workerMode: true,
  });
  return _logger;
}

export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware(),
    tanstackStartMiddleware(getLogger) as never,
  ],
}));
```

### 4. Use the context logger in your routes

Every request that flows through the middleware gets a child logger on
`context.logger` with `traceId`, `method`, and `path` already attached:

```typescript
import { createServerFn } from "@tanstack/react-start";

export const getUser = createServerFn({ method: "GET" })
  .handler(async ({ context }) => {
    // context.logger is the FlareLog child created by tanstackStartMiddleware
    context.logger.info("getUser called", { userId: 42 });
    return { id: 42, name: "Ada" };
  });
```

### 5. Publish and verify

Click **Publish** in Lovable. Once the deploy completes:

1. Visit your preview URL (`https://your-project.lovable.app`) and trigger a
   request.
2. Open your FlareLog dashboard. Within a few seconds you should see the
   "Request completed" log with `source: tanstack-start`, the `traceId`, the
   HTTP method, and the duration.
3. If nothing appears, enable `debug: true` in the `flarelog({...})` call.
   The SDK will print transport resolution to the console. In Lovable's
   editor, the Worker stdout is surfaced in the **Logs** tab.

## Troubleshooting

### Nothing shows up in the dashboard

The most common cause is the API key not reaching the SDK. Add `debug: true`
to the `flarelog({...})` call and check the resolved transports:

```typescript
_logger = flarelog({
  apiKey: env.FLARELOG_API_KEY,
  workerMode: true,
  debug: true,
});
```

If you see only `ConsoleTransport` in the debug output, the `env` lookup
failed. Log `Object.keys(event?.cloudflare?.env ?? {})` once on the first
request to confirm the binding name and shape. Different versions of the
Cloudflare adapter expose it at different paths — the factory pattern above
tries the two most common shapes and falls back to `process.env` for local
dev.

### Logs appear in dev but not in preview

This is the classic symptom that prompted this guide. Dev runs on Node with
`.env` loaded, so `process.env.FLARELOG_API_KEY` works. Preview runs on
Workers where it does not. Switch to the lazy factory pattern.

### Logs appear in preview but not in production

Same cause. Both Lovable preview and production run on Cloudflare Workers;
the same factory pattern fixes both.

### Traces are missing but logs work

FlareLog's free tier may be logs-only. If you have a paid plan that includes
traces, verify that `enableTraces` is not set to `false` on the Flarelog
transport (default is `true`). Also check that your route actually exercises
a span — the middleware logs a "Request completed" entry but does not create
a span itself. Wrap your handler body in `logger.startSpan(...)` (see the
[OTel Integration](/otel-integration/overview) guide) to emit traces.

### Console spammed with `[FlareLog] Flarelog export to ... failed`

The transport retried and gave up. Common causes:

- Wrong API key (check `Authorization: Bearer ...` value).
- Wrong endpoint (the SDK defaults to `https://flarelog.dev`; set
  `FLARELOG_ENDPOINT` if you're on a different region).
- Network egress blocked by your Cloudflare plan.

The middleware swallows flush errors so the request still succeeds, but every
failed flush prints this message once.

## See also

- [TanStack Start framework guide](/frameworks/tanstack-start) — full
  middleware API reference.
- [Cloudflare Workers platform guide](/platforms/cloudflare-workers) — the
  underlying runtime. The `workerFetch()` and `withRequest()` patterns shown
  there are for raw Workers; with TanStack Start you use the middleware
  instead, but the same `workerMode: true` and flush-on-completion rules
  apply.
