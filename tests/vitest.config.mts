import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../", import.meta.url)),
      "server-only": "next/dist/compiled/server-only/empty.js"
    }
  },
  test: {
    include: ["tests/*.test.ts"],
    // These suites use node:test and have separate CI steps.
    exclude: ["tests/training-exam.test.ts", "tests/training-survey-signature.test.ts", "tests/staging-readiness.test.ts"]
  }
});
