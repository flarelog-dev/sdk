# FlareLog SDK - Lovable Guide

[Lovable](https://lovable.dev) generates full-stack TanStack Start apps that
deploy to **Cloudflare Workers** (not static hosting). Since May 2025 every
new Lovable project uses this stack by default — see Lovable's
[Building apps using TanStack Start](https://lovable.dev/blog/building-apps-using-tanstack-start)
announcement for the full architecture.

## TL;DR

```typescript
// src/start.ts
import { createStart } from "@tanstack/react-start";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";

export const startInstance = createStart(() => ({
  requestMiddleware: [tanstackStartMiddleware() as never],
}));
```

That's it. The SDK auto-detects Cloudflare Workers, reads `FLARELOG_API_KEY`
from the Worker `env` binding (not `process.env`, which is empty on Workers),
forces `workerMode: true` so logs flush on every event, and calls
`logger.flush()` after each request so the Worker doesn't suspend mid-export.

## Why this needs special handling

Lovable's new stack runs your app as a single Cloudflare Worker. Two runtime
characteristics matter:

1. **Secrets are bindings, not env vars.** Lovable stores your `FLARELOG_API_KEY`
   in its dashboard and injects it as a Worker binding at request time. It is
   **not** present on `process.env` at module load. The SDK works around this
   by reading the binding off the request event via `getRequestEvent()` from
   `@tanstack/react-start` — automatically, on the first request.
2. **The Worker is short-lived.** Without `workerMode: true`, the SDK uses the
   default Node-style batch processor (`batchSize: 50`, `flushIntervalMs: 5000`).
   The Worker will be suspended before the timer fires, dropping all buffered
   logs. The middleware calls `await logger.flush()` after each request to
   force delivery before the Worker returns.

You don't have to think about either of these — `tanstackStartMiddleware()`
with no arguments handles both.

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

### 3. Create or update `src/start.ts`

Use the TL;DR snippet above. If `src/start.ts` already exists (Lovable
generates one with CSRF middleware), merge the two:

```typescript
import { createStart, createCsrfMiddleware } from "@tanstack/react-start";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";

export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware(),
    tanstackStartMiddleware() as never,
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

## Customizing the logger

If you need to override the defaults (sample rate, custom beforeSend, extra
transports, etc.), pass an explicit logger or a factory:

```typescript
import { flarelog } from "@flarelog/sdk";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";

const logger = flarelog({
  apiKey: process.env.FLARELOG_API_KEY!, // works in dev; on Workers use the factory below
  sampleRate: 0.1,
});

// or — lazy factory for full control on Workers:
const middleware = tanstackStartMiddleware(() => flarelog({ sampleRate: 0.1 }));
```

See the [TanStack Start framework guide](/frameworks/tanstack-start) for the
full middleware API reference.

## Troubleshooting

### Nothing shows up in the dashboard

The most common cause is the API key not reaching the SDK. Add `debug: true`
to a custom logger and check the resolved transports:

```typescript
tanstackStartMiddleware(() => flarelog({ debug: true }))
```

If you see only `ConsoleTransport` in the debug output, the `env` lookup
failed. The auto-mode tries `event.cloudflare.env` and
`event.context.cloudflare.env`; if your adapter uses a different shape, log
`Object.keys(getEvent() ?? {})` once on the first request to find the right
path, then use the factory form:

```typescript
import { getRequestEvent } from "@tanstack/react-start";
import { flarelog } from "@flarelog/sdk";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";

tanstackStartMiddleware(() => {
  const event = getRequestEvent() as any;
  return flarelog({ apiKey: event?.myAdapter?.env?.FLARELOG_API_KEY });
})
```

### Logs appear in dev but not in preview

This was the original symptom that motivated this guide. Dev runs on Node with
`.env` loaded, so `process.env.FLARELOG_API_KEY` works. Preview runs on
Workers where it does not. Use the zero-arg `tanstackStartMiddleware()` form,
which handles both runtimes.

### Logs appear in preview but not in production

Same cause. Both Lovable preview and production run on Cloudflare Workers;
the zero-arg middleware fixes both.

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
  middleware API reference, custom logger patterns, per-route middleware.
- [Cloudflare Workers platform guide](/platforms/cloudflare-workers) — the
  underlying runtime. Same `workerMode: true` and flush-on-completion rules
  apply, but for raw Workers you use `workerFetch()` instead of the TanStack
  Start middleware.
