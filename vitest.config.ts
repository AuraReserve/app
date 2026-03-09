import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: true,
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/unit/**/*.spec.{ts,tsx}",
      "tests/integration/**/*.test.{ts,tsx}",
      "tests/integration/**/*.spec.{ts,tsx}",
    ],
    exclude: ["tests/e2e/**"],
    pool: "threads",
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
