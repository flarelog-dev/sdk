/**
 * Ambient fallback types for the `cloudflare:workers` module.
 *
 * `cloudflare:workers` is a runtime-provided module on Cloudflare Workers
 * (incl. Lovable, Hono-on-Workers, TanStack Start on Workers). It is NOT an
 * npm package — the Workers runtime injects it at request time.
 *
 * When the consumer project has `@cloudflare/workers-types` installed,
 * TypeScript resolves this module against the real types and these ambient
 * declarations are ignored. This shim only exists so this SDK's own
 * `tsc --noEmit` / `tsup` dts build can typecheck without Cloudflare's types
 * installed.
 *
 * We only declare the subset we use: the `env` binding. The real module also
 * exports `ExecutionContext`, `DurableObjectNamespace`, waiting APIs, etc. —
 * see https://developers.cloudflare.com/workers/runtime-apis/bindings/
 * for the full surface.
 */
declare module "cloudflare:workers" {
  /**
   * The Worker's `env` bindings. On Cloudflare Workers, secrets and bindings
   * configured in `wrangler.jsonc` / the Lovable dashboard are accessible
   * here from any server-side code, at any point in the request lifecycle.
   *
   * The shape is project-specific (typed by `wrangler types` output), so we
   * type it loosely as a record of strings. Consumers with typed envs can
   * cast: `import { env } from "cloudflare:workers"; const e = env as Env;`.
   */
  export const env: Record<string, string | undefined>;
}
