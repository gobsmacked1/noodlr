// Flat ESLint config (ESLint 9 / typescript-eslint 8).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/", "node_modules/", ".test-build/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Tests share the source rules: they fake Foundry objects, so `any` is the honest type there too.
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Node-run build/config scripts (not bundled into the browser module).
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        Buffer: "readonly",
        fetch: "readonly",
      },
    },
  },
);
