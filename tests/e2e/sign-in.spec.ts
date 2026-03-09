import { test, expect, type Page } from "@playwright/test";
import { USER_ADMIN } from "./utils/auth";

// Helper functions to reduce duplication
const getSignInForm = (page: Page) => ({
  emailInput: page.getByLabel("Email"),
  passwordInput: page.getByLabel("Password"),
  submitButton: page.getByRole("button", { name: "Sign in with Email" }),
});

const fillAndSubmitSignIn = async (page: Page, email: string, password: string) => {
  const { emailInput, passwordInput, submitButton } = getSignInForm(page);
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await submitButton.click();
};

const expectErrorAlert = async (page: Page) => {
  await expect(page).toHaveURL(/\/auth\/signin.*/);
  const errorAlert = page.getByRole("alert").filter({ hasText: /error|invalid|failed/i });
  await expect(errorAlert).toBeVisible();
};

const expectDashboardRedirect = async (page: Page) => {
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
};

test.describe("Sign in flow", () => {
  test("renders credentials form", async ({ page }) => {
    await page.goto("/auth/signin");

    await expect(page).toHaveURL(/\/auth\/signin/);
    await expect(page.getByRole("heading", { name: "Welcome to AuraReserve" })).toBeVisible();

    const { emailInput, submitButton } = getSignInForm(page);
    await expect(emailInput).toBeVisible();
    await expect(submitButton).toBeEnabled();
  });

  test("shows helpful error for invalid credentials", async ({ page }) => {
    await page.goto("/auth/signin");

    await fillAndSubmitSignIn(page, USER_ADMIN.email, "WrongPassword!");
    await expectErrorAlert(page);

    // Email should be preserved
    const { emailInput } = getSignInForm(page);
    await expect(emailInput).toHaveValue(USER_ADMIN.email);
  });

  test("allows user to sign in with valid credentials", async ({ page }) => {
    await page.goto("/auth/signin");

    await fillAndSubmitSignIn(page, USER_ADMIN.email, USER_ADMIN.password);
    await expectDashboardRedirect(page);
  });

  test("redirects unauthenticated users and preserves callback", async ({ page }) => {
    await page.goto("/dashboard");

    // Should be redirected to sign-in with callback URL
    const redirectedUrl = new URL(page.url());
    expect(redirectedUrl.pathname).toBe("/auth/signin");
    expect(redirectedUrl.searchParams.get("callbackUrl")).toBe("/dashboard");

    await fillAndSubmitSignIn(page, USER_ADMIN.email, USER_ADMIN.password);
    await expectDashboardRedirect(page);
  });

  test("allows signup when self-registration is enabled", async ({ page }) => {
    await page.goto("/auth/signin");

    const signupLink = page.getByRole("link", { name: "Sign up" });
    if (!(await signupLink.isVisible())) {
      test.skip();
      return;
    }

    await signupLink.click();
    await expect(page).toHaveURL(/\/auth\/signup$/);

    const fullNameInput = page.getByLabel("Full Name", { exact: false });
    const emailInput = page.getByLabel("Email", { exact: false });
    const companyInput = page.getByLabel("Company (Optional)");
    const passwordInput = page.getByLabel("Password", { exact: false }).first();
    const confirmPasswordInput = page.getByLabel("Confirm Password", { exact: false });
    const submitButton = page.getByRole("button", { name: "Create Account" });

    // Try with mismatched passwords
    await fullNameInput.fill("Jane Doe");
    await emailInput.fill(`test.${Date.now()}@example.com`);
    await companyInput.fill("Aura Corp");
    await passwordInput.fill("short789");
    await confirmPasswordInput.fill("short");

    await page.evaluate(() => {
      const form = document.querySelector("form");
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const passwordError = page.getByRole("alert").filter({ hasText: "Password must be at least 8 characters long" });
    await expect(passwordError).toBeVisible();

    // Use valid password
    await passwordInput.fill("Str0ngPass!");
    await confirmPasswordInput.fill("Str0ngPass!");
    await submitButton.click();

    const successAlert = page.getByRole("alert").filter({ hasText: "Account created successfully" });
    await expect(successAlert).toBeVisible();

    await expect(page).toHaveURL(/\/auth\/signin/);
    const postSignupUrl = new URL(page.url());
    expect(postSignupUrl.searchParams.get("message")).toBe("Account created successfully");
    await expect(page.getByRole("heading", { name: "Welcome to AuraReserve" })).toBeVisible();
  });
});
