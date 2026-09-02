// eslint.config.js
import js from "@eslint/js";
import globals from "globals";
import json from "@eslint/json";
import css from "@eslint/css";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: ["public/docs/**", "package-lock.json"],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json",
    extends: ["json/recommended"],
  },
  {
    files: ["**/*.css"],
    plugins: { css },
    language: "css/css",
    extends: ["css/recommended"],
    rules: {
      "css/no-important": "off", // Silences !important warnings
      "css/no-invalid-properties": "off",
      "css/no-empty-blocks": "off",
      "css/use-baseline": "off",
    },
  },
  {
    rules: {
      "no-unused-vars": [
        "error",
        {
          vars: "local",
          args: "after-used",
          argsIgnorePattern: "^(next|_)$",
          caughtErrors: "none", // 👈 Silences the unused (err) notifications project-wide
          ignoreRestSiblings: false,
          ignoreUsingDeclarations: false,
          reportUsedIgnorePattern: false,
        },
      ],
    },
  },
]);
