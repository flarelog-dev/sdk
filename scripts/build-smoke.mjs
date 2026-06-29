/**
 * Build smoke test — runs `vite build` against a temp project that imports
 * the SDK, with the real framework packages installed.
 *
 * WHY THIS EXISTS:
 * The SDK's unit tests run under Vitest with `vi.mock()`, which intercepts
 * module resolution. They never exercise the real bundler path. So an
 * `import("cloudflare:workers")` in the SDK source works fine under Vitest
 * (mocked) but crashes Vite dev server (real bundler) because there's no
 * installable `cloudflare:workers` npm package. This script catches that
 * class of bug by actually running Vite against the built SDK.
 *
 * WHAT IT DOES:
 *   1. Creates a temp directory
 *   2. Installs the SDK (from dist/) + @tanstack/react-start + react
 *   3. Writes a minimal entry.js that imports tanstackStartMiddleware
 *   4. Runs `vite build`
 *   5. Asserts the build succeeds with no "Failed to resolve import" errors
 *
 * RUN MODE:
 *   npm run test:smoke
 *
 * Not run as part of `npm test` because it's slow (~10s) and requires network
 * access for npm install. Run it in CI before publish, and locally when
 * changing anything in src/frameworks/ or the bundler config.
 */
import { build } from "vite";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  cpSync,
  existsSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_ROOT = resolve(__dirname, "..");
const TMP = join(SDK_ROOT, ".smoke-tmp");

function log(msg) {
  console.log(`[smoke] ${msg}`);
}

function fail(msg) {
  console.error(`[smoke] FAIL: ${msg}`);
  process.exit(1);
}

// 1. Clean + create temp project
if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

log(`temp project: ${TMP}`);

writeFileSync(
  join(TMP, "package.json"),
  JSON.stringify(
    {
      name: "smoke-project",
      type: "module",
      private: true,
    },
    null,
    2,
  ),
);

// 2. Install real framework deps + vite
log("installing @tanstack/react-start + react + vite...");
try {
  execSync(
    "npm install --no-audit --no-fund --legacy-peer-deps " +
      "@tanstack/react-start@latest react@18 react-dom@18 vite@latest",
    { cwd: TMP, stdio: "pipe" },
  );
} catch (e) {
  fail(`npm install failed: ${e.message}`);
}

// 3. Install the SDK from local dist (copy dist + package.json)
log("linking local SDK build...");
mkdirSync(join(TMP, "node_modules/@flarelog/sdk"), { recursive: true });
cpSync(
  join(SDK_ROOT, "dist"),
  join(TMP, "node_modules/@flarelog/sdk/dist"),
  { recursive: true },
);
cpSync(
  join(SDK_ROOT, "package.json"),
  join(TMP, "node_modules/@flarelog/sdk/package.json"),
);

// 4. Write entry that exercises every framework subpath the SDK exports
//    AND invokes each middleware at runtime to catch shape mismatches.
const entry = join(TMP, "entry.js");
writeFileSync(
  entry,
  `
// Import every framework subpath the SDK exports — if any of them has a
// bundler-visible import that can't be resolved (e.g. "cloudflare:workers"),
// vite build fails here.
import { flarelog } from "@flarelog/sdk";
import { tanstackStartMiddleware } from "@flarelog/sdk/tanstack-start";
import { honoMiddleware } from "@flarelog/sdk/hono";
import { expressMiddleware } from "@flarelog/sdk/express";
import { withFlareLog } from "@flarelog/sdk/next";
import { withVercelServerless, withVercelEdge, detectVercelEnv } from "@flarelog/sdk/vercel";
import { workerFetch } from "@flarelog/sdk/cf-workers";

// Stub fetch so the logger's flush() succeeds — we're testing middleware
// invocation, not log shipping. Without this, the transport retries against
// a non-existent endpoint and prints noisy errors.
globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => "", json: async () => ({}) });

const logger = flarelog({ apiKey: "smoke-test-key", endpoint: "http://localhost:9999", allowInsecure: true, warnOnConsoleFallback: false });

// ─── Runtime invocation: call each middleware with a realistic request ───
// This catches shape mismatches that types can't — e.g. if a framework
// renames a field, the middleware throws at runtime here.

// 1. TanStack Start: build middleware, invoke server fn with a fake v1 result
const tsMw = tanstackStartMiddleware(logger);
// The builder should have .server()
if (typeof tsMw.server !== "function") throw new Error("tanstackStartMiddleware: missing .server()");

// 2. Hono: build middleware, invoke with a fake Hono context
const honoMw = honoMiddleware(logger);
const fakeHonoCtx = {
  req: { header: () => undefined, method: "GET", path: "/test" },
  res: { status: 200 },
  set: () => {},
  env: {},
};
await honoMw(fakeHonoCtx, async () => {});

// 3. Express: build middleware, invoke with (req, res, next)
const exMw = expressMiddleware(logger);
const fakeReq = { headers: {}, method: "GET", path: "/test" };
const fakeRes = { statusCode: 200, on: () => {} };
exMw(fakeReq, fakeRes, () => {});

// 4. Next.js Pages Router: wrap a handler and invoke
const wrappedNext = withFlareLog(logger, async (req, res) => {
  res.statusCode = 200;
  return res;
});
await wrappedNext(
  { method: "GET", url: "/test", headers: {}, query: {} },
  { statusCode: 200, headersSent: false, on: () => {}, status: () => ({}), json: () => ({}), send: () => ({}), end: () => ({}), setHeader: () => ({}), getHeader: () => undefined },
);

// 5. Vercel Serverless: wrap a handler and invoke
const wrappedVercel = withVercelServerless(logger, async (req, res) => {});
await wrappedVercel(
  { method: "GET", url: "/test", headers: {}, query: {} },
  { statusCode: 200, headersSent: false, on: () => {}, status: () => ({}), json: () => ({}), send: () => ({}), end: () => ({}), setHeader: () => ({}), getHeader: () => undefined },
);

// 6. Vercel Edge: wrap a handler and invoke with a Request
const wrappedEdge = withVercelEdge(logger, async (request) => {
  return new Response("ok", { status: 200 });
});
const edgeResponse = await wrappedEdge(new Request("http://localhost/test"));
if (edgeResponse.status !== 200) throw new Error("withVercelEdge: wrong status");

// 7. detectVercelEnv: call it (returns null on non-Vercel)
const venv = detectVercelEnv();
// null is fine — we're not on Vercel
if (venv !== null && venv.isVercel !== true) throw new Error("detectVercelEnv: bad shape");

// 8. CF Workers: wrap a handler and invoke
const wrappedWorker = workerFetch(logger, async (request, env, ctx) => {
  return new Response("ok", { status: 200 });
});
const workerResponse = await wrappedWorker(
  new Request("http://localhost/test"),
  {},
  { waitUntil: () => {} },
);
if (workerResponse.status !== 200) throw new Error("workerFetch: wrong status");

console.log("runtime OK: all 8 framework integrations invoked successfully");

// Flush the logger and exit — without this, the batch processor's 5s timer
// keeps the event loop alive and the smoke test hangs until the 15s timeout.
await logger.flush();
process.exit(0);
`,
);

// 5. Run vite build
//
// We build with `ssr` mode because TanStack Start middleware runs on the
// server, not the browser. Building for browser would fail on legitimate
// server-only imports like `node:async_hooks` (used by TanStack Start
// internals) — that's not an SDK bug. We're checking for SDK-specific
// resolution failures like `cloudflare:workers`.
log("running vite build (SSR/Node mode)...");
try {
  const result = await build({
    logLevel: "warn",
    build: {
      lib: { entry, formats: ["es"], fileName: "out" },
      ssr: true,
      // Target Node 18+ — we're building server code, not browser. Avoids
      // esbuild errors on modern syntax (destructuring, optional chaining)
      // that the default browser target (es2020) can't transpile.
      target: "node18",
      write: false,
      rollupOptions: { external: [] },
    },
  });
  const out = result[0]?.output?.[0];
  if (!out || !out.code) fail("build produced no output");
  log(`vite build OK — output size: ${out.code.length} bytes`);

  // 6. Execute the built output to verify runtime invocation works.
  // This catches shape mismatches that only surface when the middleware
  // is actually called — e.g. if a framework renames a field, the
  // middleware throws at runtime here.
  log("executing built output to verify runtime invocation...");
  const tmpOut = join(TMP, "out.mjs");
  writeFileSync(tmpOut, out.code);
  try {
    // Use inherit for stdio so we can see the "runtime OK" message and any
    // errors. The entry calls process.exit(0) after flushing to avoid the
    // batch processor's timer keeping the event loop alive.
    execSync(`node ${tmpOut}`, { cwd: TMP, stdio: "inherit", timeout: 15000 });
    log("runtime invocation OK — all middleware called successfully");
  } catch (e) {
    const stderr = e.stderr?.toString() ?? e.stdout?.toString() ?? e.message;
    fail(
      `runtime invocation failed — a middleware threw when called with a ` +
        `realistic request:\n\n${stderr}\n\n` +
        `This catches shape mismatches that types can't. Check which ` +
        `framework middleware threw and fix the shape mismatch in ` +
        `src/frameworks/.`,
    );
  }
} catch (e) {
  // Check for the specific class of error we're guarding against
  const msg = e.message || String(e);
  if (msg.includes("Failed to resolve import")) {
    fail(
      `vite build failed with a module resolution error — the SDK has a ` +
        `bundler-visible import that can't be resolved:\n\n${msg}\n\n` +
        `This is exactly the class of bug the smoke test exists to catch. ` +
        `Check src/frameworks/ for imports of runtime-only modules ` +
        `(cloudflare:workers, node:*, etc.) and hide them from static ` +
        `analysis via new Function("return import(spec)").`,
    );
  }
  fail(`vite build failed: ${msg}`);
}

// 7. Cleanup
rmSync(TMP, { recursive: true, force: true });
log("PASS — SDK builds cleanly under Vite and all middleware invoke at runtime");
