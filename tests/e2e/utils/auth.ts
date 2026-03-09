import { Page } from "@playwright/test";

export const USER_OWNER = {
  email: "owner@aurareserve.com",
  password: "password123",
};

export const USER_ADMIN = {
  email: "admin@aurareserve.com",
  password: "password123",
};

export const USER_MEMBER = {
  email: "member@aurareserve.com",
  password: "password123",
};

export const USER_AUDITOR = {
  email: "auditor@aurareserve.com",
  password: "password123",
};

/**
 * Sign in to the application using the credentials provider.
 * This function performs a real sign-in through the UI.
 */
export async function signIn(page: Page, credentials = USER_OWNER) {
  await page.goto("/auth/signin");

  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);

  await page.getByRole("button", { name: "Sign in with Email" }).click();

  // Wait for successful redirect to dashboard
  await page.waitForURL(/\/dashboard$/, { timeout: 15000 });
}

/**
 * Navigate to dashboard and verify we're authenticated.
 * If not authenticated, will be redirected to sign-in page.
 */
export async function goToDashboard(page: Page) {
  await page.goto("/dashboard");
}

/**
 * Check if currently authenticated by looking for session indicators
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  await page.goto("/dashboard");
  const url = page.url();
  return url.includes("/dashboard") && !url.includes("/auth/signin");
}
