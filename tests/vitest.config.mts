import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../", import.meta.url)),
      "server-only": "next/dist/compiled/server-only/empty.js"
    }
  },
  test: { include: ["tests/*.test.ts"] }
});
