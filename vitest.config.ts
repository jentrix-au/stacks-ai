import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig's `@/*` → `src/*` so unit tests can import modules
    // that use aliased imports.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // next-auth's ESM does `import "next/server"` (extensionless), which
      // Node-style resolution in vitest can't find; Next's own bundler adds
      // the extension. Pin it so suites that transitively touch next-auth
      // (e.g. via @/lib/session) keep running.
      "next/server": "next/server.js",
    },
  },
  test: {
    server: {
      deps: {
        // Process next-auth through Vite so the `next/server` alias above
        // applies — externalized, Node's own ESM resolution loads it and
        // fails on the extensionless import.
        inline: [/next-auth/, /@auth\/core/],
      },
    },
    // Playwright owns tests/e2e/**; vitest only runs unit specs colocated
    // with source under src/ or in a dedicated tests/unit/ tree.
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "tests/unit/**/*.{test,spec}.{ts,tsx}",
      // In-process MCP server tests (tool surface, result shapes, envelopes).
      "tests/mcp/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["node_modules/**", "tests/e2e/**", ".next/**", "dist/**"],
    passWithNoTests: true,
  },
});
