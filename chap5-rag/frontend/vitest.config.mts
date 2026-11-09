import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
    },
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    // The shared runner can spend several seconds booting a JSDOM interaction
    // test under load. Keep a bounded timeout, but avoid treating that runner
    // contention as a product failure.
    testTimeout: 15_000,
    // Several route tests exercise the shared JSDOM `window.history`; workers
    // running in parallel can overwrite another file's URL assertion.
    fileParallelism: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
