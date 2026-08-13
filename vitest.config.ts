import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Minimal standalone config: the app's vite.config.ts loads router/SSR
// plugins that unit tests don't need.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  define: { "globalThis.IS_REACT_ACT_ENVIRONMENT": "true" },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});