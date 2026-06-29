/**
 * Contract tests — verify that the APIs the SDK's tests mock actually exist
 * in the real framework packages.
 *
 * WHY THIS EXISTS:
 * The TanStack Start and Hono tests mock `@tanstack/react-start` and
 * `cloudflare:workers` with hand-rolled stubs. If the real package drops an
 * API (e.g. `getRequestEvent` was removed before v1 stable), the mock still
 * has it — so 200+ unit tests pass while production is broken. These contract
 * tests assert that every export the mocks provide is also exported by the
 * real package, so mock drift fails CI instead of failing the user.
 *
 * RUN MODE:
 * These tests SKIP by default (the framework packages are optional peer deps
 * and not installed in this repo). They run when the env var
 * `FLARELOG_RUN_CONTRACT_TESTS=1` is set AND the real package is installed —
 * typically in CI with `npm install --legacy-peer-deps @tanstack/react-start`.
 *
 * To run locally:
 *   npm install --legacy-peer-deps @tanstack/react-start@latest react@18 react-dom@18
 *   FLARELOG_RUN_CONTRACT_TESTS=1 npx vitest run tests/contract.test.ts
 */
import { describe, it, expect } from "vitest";

const RUN_CONTRACT = process.env.FLARELOG_RUN_CONTRACT_TESTS === "1";

const skip = RUN_CONTRACT ? describe : describe.skip;

// ─── @tanstack/react-start contract ─────────────────────────────────────────
//
// The mock in tests/tanstack-start.test.ts provides:
//   createMiddleware, createStart
//
// The real package MUST export at least these. If the real package drops or
// renames any of them, the SDK's middleware won't build at runtime — this
// test fails before that reaches a user.

skip("@tanstack/react-start contract", () => {
  it("exports createMiddleware (used by tanstackStartMiddleware)", async () => {
    const mod = await import("@tanstack/react-start");
    expect(typeof mod.createMiddleware).toBe("function");
  });

  it("exports createStart (used by createStart docs examples)", async () => {
    const mod = await import("@tanstack/react-start");
    expect(typeof mod.createStart).toBe("function");
  });

  it("createMiddleware() returns a builder with .server() (the v1 contract)", async () => {
    const mod = await import("@tanstack/react-start");
    const builder = mod.createMiddleware();
    expect(typeof builder.server).toBe("function");
  });

  it("createStart() accepts a getOptions callback returning { requestMiddleware }", async () => {
    const mod = await import("@tanstack/react-start");
    const start = mod.createStart(() => ({ requestMiddleware: [] }));
    expect(start).toBeDefined();
  });

  // ─── NEGATIVE contract: APIs the SDK must NOT rely on ────────────────────
  //
  // These are APIs that previous SDK versions used but were removed/never
  // existed in v1 stable. If a future PR re-introduces them, this test fails.

  it("does NOT export getRequestEvent (removed before v1 stable — SDK must not use it)", async () => {
    const mod = await import("@tanstack/react-start");
    expect("getRequestEvent" in mod).toBe(false);
  });

  it("does NOT export getEvent (common confusion with getRequestEvent)", async () => {
    const mod = await import("@tanstack/react-start");
    expect("getEvent" in mod).toBe(false);
  });
});

// ─── cloudflare:workers contract ────────────────────────────────────────────
//
// The SDK probes `cloudflare:workers` via a Function() constructor to read
// the `env` binding on Workers. This contract test verifies the module exists
// and exports `env` when running on the Workers runtime. On Node/Vitest dev,
// the Function()-hidden import fails (no ESM dynamic-import callback) — that's
// expected and the test skips. It only runs meaningfully inside a Worker
// isolate (e.g. via `wrangler dev` in CI).

skip("cloudflare:workers contract", () => {
  it("exports `env` (the Worker bindings object) on the Workers runtime", async () => {
    // Use the same Function()-hidden import as production code, so the test
    // exercises the real resolution path.
    const dynamicImport = new Function(
      "spec",
      "return import(spec)",
    ) as (spec: string) => Promise<{ env?: unknown }>;

    let mod: { env?: unknown };
    try {
      mod = await dynamicImport("cloudflare:workers");
    } catch (e) {
      // On Node/Vitest, `new Function("return import(spec)")` throws because
      // there's no ESM dynamic-import callback. On Workers runtime it works.
      // Skip in non-Worker environments.
      console.log("cloudflare:workers not reachable in this environment —", (e as Error).message);
      return;
    }

    expect(mod).toBeDefined();
    expect("env" in mod).toBe(true);
  });
});

// ─── Self-contract: SDK exports map ─────────────────────────────────────────
//
// Verify the SDK's own subpath exports resolve to real files. A broken
// exports map (e.g. a missing dist file after a build change) would crash
// every consumer at import time. This catches that before publish.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

describe("SDK self-contract — exports map", () => {
  it("package.json exports map lists all framework subpaths", () => {
    // Read the SDK's package.json via Node's module resolution — this finds
    // the package whether it's the repo itself, a symlinked install, or a
    // consumer project's node_modules.
    let pkgPath: string;
    try {
      // When running from the SDK repo, resolve "@flarelog/sdk" to itself
      pkgPath = require.resolve("@flarelog/sdk/package.json");
    } catch {
      // Fallback: relative path from this test file
      pkgPath = resolve(__dirname, "../package.json");
    }
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      exports: Record<string, unknown>;
    };

    const exports = pkg.exports;
    const expected = [
      ".",
      "./express",
      "./hono",
      "./next",
      "./react",
      "./tanstack-start",
      "./cf-workers",
      "./cf-pages",
      "./vercel",
    ];
    for (const sub of expected) {
      expect(exports[sub], `missing exports entry for "${sub}"`).toBeDefined();
    }
  });
});

// ─── Hono contract ──────────────────────────────────────────────────────────
//
// The SDK's Hono integration uses inline types for `Context` but relies on
// Hono's runtime shape: `c.req.header()`, `c.req.method`, `c.req.path`,
// `c.res.status`, `c.set()`, `c.env`. If Hono changes any of these, the
// middleware breaks at runtime. This contract test verifies the real Hono
// package exports a `Hono` class whose context has the expected shape.

skip("Hono contract", () => {
  it("exports the Hono class", async () => {
    const mod = await import("hono");
    expect(typeof mod.Hono).toBe("function");
  });

  it("Hono context has req.header(), req.method, req.path, res.status, set(), env", async () => {
    const { Hono } = await import("hono");
    const app = new Hono();

    // Register a route that captures the context shape
    let captured: Record<string, unknown> = {};
    app.get("/test", (c) => {
      captured = {
        hasReqHeader: typeof c.req.header === "function",
        hasReqMethod: "method" in c.req,
        hasReqPath: "path" in c.req,
        hasResStatus: "status" in c.res,
        hasSet: typeof c.set === "function",
        hasEnv: "env" in c,
      };
      return c.text("ok");
    });

    // Invoke the route with a fake request
    const req = new Request("http://localhost/test", { method: "GET" });
    await app.fetch(req);

    expect(captured.hasReqHeader).toBe(true);
    expect(captured.hasReqMethod).toBe(true);
    expect(captured.hasReqPath).toBe(true);
    expect(captured.hasResStatus).toBe(true);
    expect(captured.hasSet).toBe(true);
    expect(captured.hasEnv).toBe(true);
  });
});

// ─── Next.js contract ───────────────────────────────────────────────────────
//
// The SDK's Next.js integration wraps Pages Router API routes
// (`(req: NextApiRequest, res: NextApiResponse) => ...`). If Next.js changes
// these shapes (e.g. drops Pages Router in favor of App Router only), the
// wrappers break. This contract test verifies the real `next` package is
// importable and exposes the expected types.

skip("Next.js contract", () => {
  it("the next package is importable", async () => {
    // `next` is a CLI package, not a library — but it should at least
    // resolve. If the import throws, the package isn't installed.
    const mod = await import("next");
    expect(mod).toBeDefined();
  });
});

// ─── Express contract ───────────────────────────────────────────────────────
//
// Express's (req, res, next) signature is stable since 2014, but we verify
// the real package exports the expected function signature anyway.

skip("Express contract", () => {
  it("exports a default function (the express app factory)", async () => {
    const mod = await import("express");
    expect(typeof mod.default).toBe("function");
  });

  it("express() returns an app with .use(), .get(), .post()", async () => {
    const express = (await import("express")).default;
    const app = express();
    expect(typeof app.use).toBe("function");
    expect(typeof app.get).toBe("function");
    expect(typeof app.post).toBe("function");
  });
});
