import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Nested agent worktrees (created under .claude/worktrees during parallel
    // multi-agent runs) carry their own .next/node_modules copies; scan only
    // the real tree.
    ".claude/**",
  ]),
]);

export default eslintConfig;
