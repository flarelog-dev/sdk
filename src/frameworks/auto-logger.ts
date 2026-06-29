import { flarelog } from "../factory";
import type { FlareLog } from "../client";
import { detectRuntime } from "../otel/env";

// ─── Worker env binding detection ───────────────────────────────────────────
//
// On Cloudflare Workers (incl. Lovable, Hono-on-Workers, TanStack Start on
// Workers), secrets arrive as `env` bindings — NOT on `process.env` at module
// load. The SDK resolves them lazily, on the first request, from one of:
//
//   1. `process.env` — works on Node, Vercel, and Cloudflare Workers with
//      `nodejs_compat` enabled. TanStack Start v1 + `@cloudflare/vite-plugin`
//      populates `process.env` per-request inside middleware `.server()`
//      callbacks, so this is the primary path even on Workers.
//   2. The `cloudflare:workers` module — the Cloudflare-canonical way to read
//      bindings from module scope on Workers. We probe it lazily so the SDK
//      stays zero-dependency on Node/Vercel (the import is a no-op there).
//   3. An explicit `env` arg — for frameworks that expose the binding on the
//      request context (Hono's `c.env`, `pagesFunction`'s `context.env`, …).
//
// We intentionally do NOT use `getRequestEvent()` from `@tanstack/react-start`:
// it was removed before the v1 stable release and is not exported by
// `@tanstack/react-start` >= 1.0.0. See the framework guide for the canonical
// v1 patterns.

type EnvRecord = Record<string, string | undefined>;

let _cloudflareEnv: EnvRecord | null | undefined;
let _cachedWorkerEnv: EnvRecord | null = null;

/**
 * Lazily probe `cloudflare:workers` and return its `env` bindings.
 *
 * - On Cloudflare Workers (with or without `nodejs_compat`), this is the
 *   canonical way to read bindings from module scope. The module is provided
 *   by the Workers runtime and is always available there.
 * - On Node / Vercel / Bun / Deno, the dynamic `import("cloudflare:workers")`
 *   throws synchronously (the module does not exist). We catch and cache `null`
 *   so subsequent calls are free.
 *
 * The result is cached for the lifetime of the isolate. On a Worker, that
 * means it's cached per-Worker-instance (which is what we want — bindings
 * don't change at runtime).
 */
async function tryLoadCloudflareEnv(): Promise<EnvRecord | null> {
  if (_cloudflareEnv !== undefined) return _cloudflareEnv;

  try {
    // `cloudflare:workers` is a runtime-provided module on Workers.
    // The dynamic import keeps the SDK zero-dependency on Node and lets
    // bundlers tree-shake this path away for non-Worker builds.
    const mod = (await import("cloudflare:workers")) as {
      env?: EnvRecord;
    };
    _cloudflareEnv = mod.env ?? null;
    return _cloudflareEnv;
  } catch {
    // Not on Cloudflare Workers — module doesn't exist. Cache the miss.
    _cloudflareEnv = null;
    return _cloudflareEnv;
  }
}

/**
 * Resolve a FlareLog API key (and friends) from wherever they live on the
 * current runtime. Resolution order:
 *
 *   1. `process.env` — Node, Vercel, Cloudflare Workers with `nodejs_compat`.
 *      On TanStack Start v1 + Workers, `@cloudflare/vite-plugin` populates
 *      `process.env` per-request inside `.server()` callbacks, so this is the
 *      primary path even on edge runtimes.
 *   2. The Cloudflare Worker `env` binding — read via `import { env } from
 *      "cloudflare:workers"`. The canonical Workers pattern, works whether or
 *      not `nodejs_compat` is enabled.
 *
 * Returns `null` if nothing was found, so the caller can decide whether to
 * fall back to console-only logging.
 *
 * @param env Optional explicit env record (e.g. Hono's `c.env`). When passed,
 *   it takes precedence over both `process.env` and the `cloudflare:workers`
 *   binding — this is the fastest and most reliable path.
 */
export async function resolveWorkerEnv(
  env?: EnvRecord | null,
): Promise<EnvRecord | null> {
  // 0. Explicit env arg (Hono's `c.env`, `pagesFunction`'s `context.env`, …)
  if (env && env.FLARELOG_API_KEY) return env;

  // 1. process.env — cheap, sync, works on Node/Vercel/Workers-with-nodejs_compat.
  //    On TanStack Start v1 + Workers, this is populated per-request inside
  //    middleware `.server()` callbacks by @cloudflare/vite-plugin.
  try {
    const proc = (globalThis as { process?: { env?: EnvRecord } }).process;
    if (proc?.env?.FLARELOG_API_KEY) return proc.env;
  } catch {
    /* ignore — process is undefined on some runtimes */
  }

  // 2. Cache hit from a previous request on this Worker isolate
  if (_cachedWorkerEnv) return _cachedWorkerEnv;

  // 3. Cloudflare Workers `env` binding via the `cloudflare:workers` module
  const cfEnv = await tryLoadCloudflareEnv();
  if (cfEnv?.FLARELOG_API_KEY) {
    _cachedWorkerEnv = cfEnv;
    return cfEnv;
  }

  return null;
}

function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

/**
 * Build a FlareLog instance pre-configured for the current runtime. Detects
 * Cloudflare Workers (incl. Lovable, Hono-on-Workers) automatically and:
 *   - reads `FLARELOG_*` secrets from `process.env`, the `cloudflare:workers`
 *     `env` binding, or an explicit `env` arg (in that order)
 *   - forces `workerMode: true` (flush on every event, no 5s timer)
 *
 * **When to call this:** inside a request handler, NOT at module load. The
 * Worker `env` binding is only reachable from inside a request.
 *
 * **Passing `env` explicitly:** if your framework exposes the Worker `env` on
 * the request context (Hono's `c.env`, `pagesFunction`'s `context.env`, etc.),
 * pass it here — that's faster and more reliable than probing.
 *
 * @example TanStack Start / generic — auto-detect env source
 * ```ts
 * const logger = await autoLogger();
 * ```
 *
 * @example Hono — pass `c.env` directly
 * ```ts
 * app.use("*", async (c, next) => {
 *   const logger = await autoLogger(c.env);
 *   // ...
 * });
 * ```
 *
 * Safe to call on Node/Vercel too — it just reads `process.env` like normal.
 */
export async function autoLogger(
  env?: EnvRecord | null,
): Promise<FlareLog> {
  const runtime = detectRuntime();
  const isWorker =
    runtime === "cloudflare-workers" || runtime === "vercel";
  const resolved = (await resolveWorkerEnv(env)) ?? {};

  return flarelog({
    apiKey: resolved.FLARELOG_API_KEY,
    endpoint: resolved.FLARELOG_ENDPOINT,
    environment: resolved.FLARELOG_ENVIRONMENT ?? resolved.NODE_ENV,
    release: resolved.FLARELOG_RELEASE,
    serverName: resolved.FLARELOG_SERVER_NAME,
    workerMode: isWorker || undefined,
    // Auto-enable OTLP transport if standard OTEL_* env vars are set
    otlpEndpoint: resolved.OTEL_EXPORTER_OTLP_ENDPOINT,
    otlpHeaders: resolved.OTEL_EXPORTER_OTLP_HEADERS
      ? parseHeaders(resolved.OTEL_EXPORTER_OTLP_HEADERS)
      : undefined,
  });
}

/**
 * @internal Reset all module-level caches. Used by tests to isolate cases.
 * Not part of the public API — may be removed in any release.
 */
export function __resetAutoLoggerCache(): void {
  _cloudflareEnv = undefined;
  _cachedWorkerEnv = null;
}
