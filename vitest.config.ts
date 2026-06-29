import { defineConfig } from "vitest/config";

/**
 * Vitest configuration.
 *
 * The SDK has optional peer deps (@tanstack/react-start, next, react) that
 * aren't installed in this repo by default. Vitest intercepts imports of
 * optional peer deps and replaces them with a stub that throws
 * `__vite-optional-peer-dep:...`. This breaks the contract tests, which
 * need to import the REAL packages when they're installed.
 *
 * The `deps.inline` setting tells Vitest to resolve these packages
 * normally (from node_modules) instead of using the optional-peer-dep stub.
 * When the package isn't installed, the import still fails — but with a
 * normal "module not found" error that the contract tests' skip logic
 * handles gracefully.
 */
export default defineConfig({
  test: {
    globals: false,
    deps: {
      inline: [
        /@tanstack\/react-start/,
        /@tanstack\/start-client-core/,
        /^next$/,
        /^hono$/,
        /^express$/,
        /^react$/,
        /^react-dom$/,
      ],
    },
  },
});
