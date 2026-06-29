import { flarelog } from "../factory";
import type { FlareLog } from "../client";
import { detectRuntime } from "../otel/env";

// ─── Worker env binding detection ───────────────────────────────────────────
//
// On Cloudflare Workers (incl. Lovable, Hono-on-Workers, etc.), secrets arrive
// as `env` bindings on the request event, NOT on `process.env`. The binding
// shape varies between adapter versions, so we probe the known paths and cache
// the result.
//
// TanStack Start v1 exposes the current request event via
// `getRequestEvent()` from `@tanstack/react-start`. We probe that API and,
// if missing, fall back to an empty result so the SDK stays zero-dependency
// and never pulls in unstable deep dependencies such as `vinxi/http`.

type EnvRecord = Record<string, string | undefined>;

let _getEventFn: (() => unknown) | null | undefined;
let _cachedWorkerEnv: EnvRecord | null = null;

async function tryLoadGetEvent(): Promise<(() => unknown) | null> {
  if (_getEventFn !== undefined) return _getEventFn;

  // Try TanStack Start v1 API (getRequestEvent from @tanstack/react-start).
  try {
    const mod = (await import("@tanstack/react-start")) as unknown as {
      getRequestEvent?: () => unknown;
    };
    if (mod.getRequestEvent) {
      _getEventFn = mod.getRequestEvent;
      return _getEventFn;
    }
  } catch {
    /* ignore — module not installed */
  }

  // No fallback to `vinxi/http` — it is a pre-release deep dependency of
  // TanStack Start v1 and is not guaranteed to be installed. Returning null
  // lets resolveWorkerEnv fall back to process.env or an explicit key.
  _getEventFn = null;
  return _getEventFn;
}

function extractEnvFromEvent(event: unknown): EnvRecord | null {
  if (!event || typeof event !== "object") return null;
  const e = event as {
    cloudflare?: { env?: EnvRecord };
    context?: { cloudflare?: { env?: EnvRecord } };
    env?: EnvRecord;
  };
  return e.cloudflare?.env ?? e.context?.cloudflare?.env ?? e.env ?? null;
}

/**
 * Resolve a FlareLog API key (and friends) from wherever they live on the
 * current runtime. Resolution order:
 *   1. `process.env` — Node, Vercel, Workers with `nodejs_compat` + plaintext vars
 *   2. The Cloudflare Worker `env` binding on the current request event
 *     (looked up via `getRequestEvent()` from `@tanstack/react-start`)
 *
 * Returns `null` if nothing was found, so the caller can decide whether to
 * fall back to console-only logging.
 */
export async function resolveWorkerEnv(): Promise<EnvRecord | null> {
  // 1. process.env (cheap, sync, works on Node/Vercel)
  try {
    const proc = (globalThis as { process?: { env?: EnvRecord } }).process;
    if (proc?.env?.FLARELOG_API_KEY) return proc.env;
  } catch {
    /* ignore */
  }

  // 2. Cache hit from a previous request on this Worker isolate
  if (_cachedWorkerEnv) return _cachedWorkerEnv;

  // 3. Try to pull the binding off the current request event
  const getEvent = await tryLoadGetEvent();
  if (!getEvent) return null;
  try {
    const env = extractEnvFromEvent(getEvent());
    if (env) {
      _cachedWorkerEnv = env;
      return env;
    }
  } catch {
    /* getEvent() throws outside a request — ignore */
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
 *   - reads `FLARELOG_*` secrets from the Worker `env` binding
 *   - forces `workerMode: true` (flush on every event, no 5s timer)
 *
 * **When to call this:** inside a request handler, NOT at module load. The
 * Worker `env` binding is only reachable from inside a request.
 *
 * **Passing `env` explicitly:** if your framework exposes the Worker `env` on
 * the request context (Hono's `c.env`, `pagesFunction`'s `context.env`, etc.),
 * pass it here — that's faster and more reliable than probing `getEvent()`.
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
  const resolved = env ?? (await resolveWorkerEnv()) ?? {};

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
  _getEventFn = undefined;
  _cachedWorkerEnv = null;
}
