import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Gunakan worker_threads (bukan child-process forks) agar terjalan di
    // lingkungan yang memblokir spawn sub-process (EPERM pada pipes).
    // maxWorkers 1 = satu thread saja (setara "single thread").
    pool: "threads",
    maxWorkers: 1,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", ".npm-cache/**"],
  },
});