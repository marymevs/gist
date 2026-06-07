// ESLint v9 flat config for Firebase Cloud Functions (TypeScript).
// Migrated from the legacy .eslintrc format — see
// https://eslint.org/docs/latest/use/configure/migration-guide
//
// CommonJS module (package.json has "type": "commonjs").

const js = require("@eslint/js");
const tseslint = require("@typescript-eslint/eslint-plugin");
const globals = require("globals");

module.exports = [
  // Don't lint build output, deps, or coverage reports.
  {
    ignores: ["lib/**", "node_modules/**", "coverage/**", "generated/**"],
  },

  // Baseline JS recommended rules (applies to this config file too).
  js.configs.recommended,

  // typescript-eslint recommended — flat array that registers the plugin,
  // the @typescript-eslint/parser, and the recommended (non-type-checked) rules.
  ...tseslint.configs["flat/recommended"],

  // Project source: Node runtime, ES modules.
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    rules: {
      // Allow intentionally-unused args/vars when prefixed with `_`.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // `any` shows up in a few Firestore/dynamic-context type defs; surface
      // it as a warning to clean up over time rather than failing the build.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Tests: vitest globals + a little more leniency.
  {
    files: ["src/**/*.test.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // This config file (and any other plain JS) is CommonJS, not TS modules.
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
