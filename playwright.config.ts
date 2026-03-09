import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config({ path: ".env.test" });
dotenv.config({ path: ".env" });

const PORT = process.env.PORT ?? "3000";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec next start --hostname 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT,
      DATABASE_URL: process.env.DATABASE_URL ?? "file:./test.db",
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "test-secret-string-with-minimum-length-32",
      BETTER_AUTH_URL: baseURL,
      AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST ?? "true",
      AUTH_CREDENTIALS_ENABLED: process.env.AUTH_CREDENTIALS_ENABLED ?? "true",
      AUTH_GOOGLE_ENABLED: process.env.AUTH_GOOGLE_ENABLED ?? "false",
      AUTH_AZURE_ENABLED: process.env.AUTH_AZURE_ENABLED ?? "false",
    },
  },
  projects: [
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"] },
    },/*
    {
      name: "Desktop Firefox",
      use: { ...devices["Desktop Firefox"] },
    }*/
  ],
});
