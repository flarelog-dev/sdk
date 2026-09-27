import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

/**
 * Vitest configuration for the contract tests.
 *
 * The env var is set here rather than inline in the npm script
 * (`FLARELOG_RUN_CONTRACT_TESTS=1 vitest ...`) because that POSIX syntax fails
 * on Windows shells. Setting it in config keeps `npm run test:contract`
 * working on every platform.
 *
 * CI installs the real framework packages before running this, so the tests
 * resolve them and assert the API surface. Locally they are usually absent and
 * report as skipped rather than failing.
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      env: { FLARELOG_RUN_CONTRACT_TESTS: "1" },
      include: ["tests/contract.test.ts"],
    },
  })
);
