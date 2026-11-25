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
    // The training suites run with node:test via npm run training:unit.
    exclude: ["tests/training-exam.test.ts", "tests/training-survey-signature.test.ts"]
  }
});
