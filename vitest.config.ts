import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Domain-layer tests run in the fast Node environment. When we add React component
// tests (PR3), switch specific files to jsdom via `// @vitest-environment jsdom`.
export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
