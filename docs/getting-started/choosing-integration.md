# Choosing the Right Integration

Not sure which FlareLog integration to use? This guide will help you decide.

## Quick Decision Tree

```
Are you using a framework?
├── Yes
│   ├── [Express](/frameworks/express)    → `@flarelog/sdk/express`
│   ├── [Hono](/frameworks/hono)       → `@flarelog/sdk/hono`
│   ├── [Next.js](/frameworks/nextjs)    → `@flarelog/sdk/next`
│   ├── [React](/guides/browser)      → `@flarelog/sdk/react`
│   └── [TanStack](/frameworks/tanstack-start)   → `@flarelog/sdk/tanstack-start`
└── No (plain handler)
    ├── [Cloudflare Workers](/platforms/cloudflare-workers) → `@flarelog/sdk/cf-workers`
    ├── [Vercel Serverless](/platforms/vercel)  → `@flarelog/sdk/vercel (withVercelServerless)`
    ├── [Vercel Edge](/platforms/vercel)        → `@flarelog/sdk/vercel (withVercelEdge)`
    └── [Node.js / other](/guides/nodejs)    → `@flarelog/sdk` (core)
```

## Integration Reference

| Your stack | Import | What you get |
|---|---|---|
| **[Express](/frameworks/express)** | `@flarelog/sdk/express` | `expressMiddleware` + `expressErrorHandler`, `req.logger` |
| **[Hono](/frameworks/hono)** | `@flarelog/sdk/hono` | `honoMiddleware`, `c.get("logger")` |
| **[Next.js](/frameworks/nextjs)** (API routes) | `@flarelog/sdk/next` | `withFlareLog`, `req.logger` + `req.traceId` |
| **[React](/guides/browser)** (browser) | `@flarelog/sdk/react` | `FlareLogErrorBoundary`, `useFlareLog` hook |
| **[TanStack Start](/frameworks/tanstack-start)** | `@flarelog/sdk/tanstack-start` | Server function + client wrappers |
| **[Cloudflare Workers](/platforms/cloudflare-workers)** (plain) | `@flarelog/sdk/cf-workers` | `workerFetch`, full OTel spans, `ctx.waitUntil` flush |
| **[Vercel](/platforms/vercel)** (standalone API, Edge, Middleware) | `@flarelog/sdk/vercel` | `withVercelServerless` + `withVercelEdge` |
| **No framework / custom** | `@flarelog/sdk` | Core `flarelog()` factory, spans, `logError`, breadcrumbs |

## Common Confusion Points

- **"Next.js on Vercel"** → Use `@flarelog/sdk/next`. The Next.js integration works on any hosting platform; Vercel is just deployment.
- **"React on Vercel"** → Use `@flarelog/sdk/react` for the client side, `@flarelog/sdk/next` for API routes.
- **"Vercel without Next.js"** → Use `@flarelog/sdk/vercel` for standalone `api/` routes, Edge Functions, and Middleware.
- **"Hono on Cloudflare Workers"** → Use `@flarelog/sdk/hono` for the middleware. Optionally pair with `@flarelog/sdk/cf-workers` for `workerFetch`.

> **Rule of thumb**: Pick the **framework** integration first. Only reach for the **platform** integration (`cf-workers`, `vercel`) when you don't use a framework or need platform-specific features like OTel span auto-creation or execution-context flushing.

## Framework vs Platform Integrations

Understanding the difference helps you pick the right one:

| | Framework integrations | Platform integrations |
|---|---|---|
| **Examples** | `/express`, `/hono`, `/next`, `/react`, `/tanstack-start` | `/cf-workers`, `/vercel` |
| **Tied to** | A web framework | A deployment runtime |
| **Works on** | Any platform that runs the framework | Only the specific platform |
| **What they do** | Attach logger to framework objects (`req.logger`, `c.get("logger")`) | OTel span creation, execution-context flushing, env detection |
| **When to use** | You're using that framework (always preferred) | You're writing raw handlers without a framework |

### Overlap examples

| Scenario | Use | Reason |
|---|---|---|
| Next.js on Vercel | `/next` | Framework integration is the right abstraction |
| Next.js on a VPS | `/next` | Same — framework integration is platform-agnostic |
| Hono on Cloudflare Workers | `/hono` | Framework integration; Hono runs natively on Workers |
| Plain Worker (no framework) | `/cf-workers` | Need platform-specific `workerFetch` + `ctx.waitUntil` |
| Vercel API route (no Next.js) | `/vercel` | Need platform-specific Serverless/Edge wrappers |
| Express on Vercel Serverless | `/express` | Framework integration; runs on Node.js under the hood |
