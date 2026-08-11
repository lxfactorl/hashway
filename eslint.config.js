import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  {
    ignores: [
      "dist/**",
      ".wxt/**",
      ".output/**",
      "node_modules/**",
      "coverage/**",
      "package-lock.json",
    ],
  },
  {
    files: ["**/*.ts"],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.tests.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["src/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "webextension-polyfill", message: "Domain must not import browser APIs." },
            { name: "wxt", message: "Domain must not import WXT." },
            { name: "@adapters/firefox", message: "Domain must not import adapters." },
            { name: "@adapters/real-debrid", message: "Domain must not import adapters." },
            { name: "@adapters/storage", message: "Domain must not import adapters." },
            { name: "@adapters/diagnostics", message: "Domain must not import adapters." },
            { name: "@application", message: "Domain must not import application." },
          ],
          patterns: ["@adapters/*", "@application/*", "webextension-polyfill*", "wxt*"],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='browser']",
          message: "Domain must not access browser.* APIs.",
        },
        {
          selector: "MemberExpression[object.name='chrome']",
          message: "Domain must not access chrome.* APIs.",
        },
        {
          selector: "MemberExpression[object.name='self']",
          message: "Domain must not access self.* APIs.",
        },
        {
          selector: "MemberExpression[object.name='window']",
          message: "Domain must not access window.* APIs.",
        },
      ],
    },
  },
  {
    files: ["src/application/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "webextension-polyfill", message: "Application must not import browser APIs." },
            { name: "wxt", message: "Application must not import WXT." },
          ],
          patterns: ["@adapters/*", "webextension-polyfill*", "wxt*"],
        },
      ],
    },
  },
  {
    files: ["src/ports/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "webextension-polyfill", message: "Ports must not import browser APIs." },
            { name: "wxt", message: "Ports must not import WXT." },
          ],
          patterns: ["@adapters/*", "webextension-polyfill*", "wxt*"],
        },
      ],
    },
  },
  {
    files: ["src/adapters/firefox/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@adapters/real-debrid",
              message: "Firefox adapter must not import the Real-Debrid adapter.",
            },
            {
              name: "@adapters/storage",
              message: "Firefox adapter must not import other adapters.",
            },
            {
              name: "@adapters/diagnostics",
              message: "Firefox adapter must not import other adapters.",
            },
          ],
          patterns: ["@adapters/real-debrid*", "@adapters/storage*", "@adapters/diagnostics*"],
        },
      ],
    },
  },
  {
    files: ["src/adapters/real-debrid/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@adapters/firefox",
              message: "Real-Debrid adapter must not import the Firefox adapter.",
            },
            {
              name: "@adapters/storage",
              message: "Real-Debrid adapter must not import other adapters.",
            },
            {
              name: "@adapters/diagnostics",
              message: "Real-Debrid adapter must not import other adapters.",
            },
          ],
          patterns: ["@adapters/firefox*", "@adapters/storage*", "@adapters/diagnostics*"],
        },
      ],
    },
  },
  {
    files: ["src/adapters/storage/**", "src/adapters/diagnostics/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@adapters/firefox",
              message: "Storage/diagnostics adapters must not import the Firefox adapter.",
            },
            {
              name: "@adapters/real-debrid",
              message: "Storage/diagnostics adapters must not import the Real-Debrid adapter.",
            },
          ],
          patterns: ["@adapters/firefox*", "@adapters/real-debrid*"],
        },
      ],
    },
  },
);
