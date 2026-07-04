import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Domain-layer tests run in the fast Node environment. When we add React component
// tests (PR3), switch specific files to jsdom via `// @vitest-environment jsdom`.
export default defineConfig({
  test: {
    environment: "node",
    // Exclude nested agent worktrees (created under .claude/worktrees during
    // parallel multi-agent runs) so their copies of the test suite don't get
    // picked up alongside the real one, in addition to vitest's own defaults.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.git/**", ".claude/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
