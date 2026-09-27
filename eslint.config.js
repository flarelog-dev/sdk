import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/", "dist-docs/", "docs/", "node_modules/", "coverage/", "*.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Shared across src/ and tests/ so the gate stays uniform.
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}", "scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2022,
        // The SDK targets edge runtimes and reads these defensively through
        // `globalThis`, so they are not guaranteed to exist.
        process: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      // The SDK is deliberately dependency-free and ESM-first, so a handful of
      // ambient/browser globals are legitimately referenced.
      "no-undef": "off",
      // Internal diagnostics intentionally write to the console; each site
      // carries an eslint-disable-next-line no-console with a reason.
      "no-console": "warn",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Hand-written shims for optional peer packages model third-party types
    // we do not control, so `any` is the honest choice there.
    files: ["src/types/**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  {
    files: ["tests/**/*.ts", "tests/**/*.tsx", "scripts/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser, ...globals.es2022 },
    },
    rules: {
      "no-console": "off",
      // Tests legitimately build partial fixtures and assert on loose shapes.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      // Reported as warnings rather than blocking CI: unused imports and
      // placeholder parameters in the existing suite are cosmetic, and the
      // gate is more useful green-and-warning than red-and-ignored.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  }
);
