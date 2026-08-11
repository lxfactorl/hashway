import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@domain": "/src/domain",
      "@application": "/src/application",
      "@ports": "/src/ports",
      "@adapters": "/src/adapters",
      "@entrypoints": "/src/entrypoints",
      "@tests": "/tests",
    },
  },
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/property/**/*.test.ts",
      "tests/e2e/**/*.e2e.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
      exclude: [
        "dist/**",
        ".wxt/**",
        "node_modules/**",
        "tests/**",
        "wxt.config.ts",
        "vitest.config.ts",
        "eslint.config.js",
        "web-ext.config.js",
        "src/**/index.ts",
      ],
    },
  },
});
