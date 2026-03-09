import { expect, test } from "@playwright/test";

const OWNER_EMAIL = process.env.E2E_LOGIN_EMAIL ?? "owner@aurareserve.com";
const OWNER_PASSWORD_CANDIDATES = process.env.E2E_LOGIN_PASSWORD
  ? [process.env.E2E_LOGIN_PASSWORD]
  : ["Password123!", "password123"];

test.describe("Portal input audit", () => {
  test.setTimeout(240_000);

  test("core data input flows work end-to-end", async ({ page }) => {
    const suffix = Date.now().toString().slice(-6);
    const spaceName = `QA Input Space ${suffix}`;
    const storeName = `QA Store ${suffix}`;
    const apiKeyLabel = `QA Key ${suffix}`;
    const profileName = `Owner QA ${suffix}`;
    const profileCompany = `QA Co ${suffix}`;
    let ownerPassword = "";
    let createSpaceWorked = false;

    await test.step("sign in", async () => {
      await page.goto("/auth/signin");

      for (const candidate of OWNER_PASSWORD_CANDIDATES) {
        await page.getByLabel(/Email( address)?/i).fill(OWNER_EMAIL);
        await page.getByLabel("Password").fill(candidate);
        await page.getByRole("button", { name: /Sign in( with Email)?/i }).click();

        await page.waitForLoadState("networkidle");
        if (/\/dashboard$/.test(page.url())) {
          ownerPassword = candidate;
          break;
        }
      }

      expect(ownerPassword).toBeTruthy();
      await expect(page).toHaveURL(/\/dashboard$/);
    });

    let spaceSlug = "";

    await test.step("create a new space (or capture failure and continue)", async () => {
      await page.goto("/spaces");
      await page.getByRole("button", { name: /Create Space|Create Your First Space/i }).click();
      await page.getByLabel(/Space Name/i).fill(spaceName);
      await page.getByLabel(/Description/i).fill("Space created by e2e input audit.");
      await page.getByRole("button", { name: "Create Now" }).click();

      const heading = page.getByRole("heading", { name: spaceName }).first();
      const createError = page.getByRole("alert").filter({ hasText: /Failed to create space/i }).first();
      const successVisible = await heading.isVisible({ timeout: 12000 }).catch(() => false);

      if (successVisible) {
        createSpaceWorked = true;
        await heading.click();
        await page.waitForURL(/\/spaces\/[^/]+$/, { timeout: 15000 });
      } else {
        await expect(createError).toBeVisible({ timeout: 5000 });
        createSpaceWorked = false;
        await page.getByRole("button", { name: "Cancel" }).click();
        await page.getByRole("button", { name: /Open Space/i }).first().click();
        await page.waitForURL(/\/spaces\/[^/]+$/, { timeout: 15000 });
      }

      expect.soft(createSpaceWorked, "Create Space input flow should succeed").toBe(true);

      const url = new URL(page.url());
      const parts = url.pathname.split("/").filter(Boolean);
      spaceSlug = parts[1] ?? "";
      expect(spaceSlug).toBeTruthy();
    });

    await test.step("create a data store", async () => {
      await page.goto(`/spaces/${spaceSlug}/stores`);
      await page.getByRole("button", { name: /New Data Store|Create First Data Store/i }).click();

      await page.locator("#stream-name").fill(storeName);
      await page.locator("#stream-asset-type").fill("gold");
      await page.locator("#stream-unit").fill("grams");
      await page.locator("#stream-description").fill("Store created by e2e input audit.");
      await page.getByRole("button", { name: "Create Data Store" }).click();

      await expect(page.getByRole("link", { name: storeName })).toBeVisible({ timeout: 10000 });
    });

    await test.step("submit a value entry", async () => {
      await page.getByRole("link", { name: storeName }).click();
      await page.getByRole("button", { name: "Add Entry" }).click();

      await page.getByLabel(/^Value/).fill("1234.56");
      await page.getByLabel("Notes").fill("Entry created by e2e input audit.");
      await page.getByRole("button", { name: "Submit Entry" }).click();

      await expect(page.getByText(/Entry created by e2e input audit/i)).toBeVisible({ timeout: 10000 });
    });

    await test.step("update space settings", async () => {
      await page.goto(`/spaces/${spaceSlug}/settings`);

      await page.locator("#space_description_input").fill("Updated by e2e input audit.");
      await page.getByRole("button", { name: "Save Changes" }).click();

      await expect(page.getByText(/Settings saved/i)).toBeVisible({ timeout: 10000 });
    });

    await test.step("create an API key", async () => {
      await page.goto(`/spaces/${spaceSlug}/api-management`);

      const keyInput = page.getByPlaceholder("Key label (e.g. Production App)");
      await expect(keyInput).toBeVisible({ timeout: 10000 });
      await keyInput.fill(apiKeyLabel);
      await page.getByRole("button", { name: "Create Key" }).click();

      await expect(page.getByRole("heading", { name: "API Key Created Successfully" })).toBeVisible({ timeout: 10000 });
      await page.getByRole("button", { name: "I've Saved My Key" }).click();
      await expect(page.getByText(apiKeyLabel)).toBeVisible({ timeout: 10000 });
    });

    await test.step("add a member", async () => {
      await page.goto(`/spaces/${spaceSlug}/members`);
      await page.getByRole("button", { name: "Add Member" }).click();

      const dialog = page.getByRole("dialog", { name: /Add Member to Space/i });
      await dialog.getByText("Select a user").click();
      const firstOption = page.getByRole("option").first();
      await expect(firstOption).toBeVisible({ timeout: 10000 });
      await firstOption.click();

      await dialog.getByRole("button", { name: "Add Member" }).click();
      await expect(page.getByText(/Member added successfully/i)).toBeVisible({ timeout: 10000 });
    });

    await test.step("edit profile and validate password mismatch handling", async () => {
      await page.goto("/profile");

      await page.getByRole("button", { name: "Edit Profile" }).click();
      await page.getByLabel("Full Name").fill(profileName);
      await page.getByLabel("Company").fill(profileCompany);
      await page.getByRole("button", { name: "Save Changes" }).click();
      await expect(page.getByText(/Profile updated successfully/i)).toBeVisible({ timeout: 10000 });

      await page.getByRole("button", { name: "Change Password" }).click();
      await page.getByLabel("Current Password").fill(ownerPassword);
      await page.getByLabel("New Password").fill("Mismatch123!");
      await page.getByLabel("Confirm New Password").fill("Mismatch1234!");
      await page.getByRole("button", { name: "Update Password" }).click();

      await expect(page.getByText(/New passwords do not match/i)).toBeVisible({ timeout: 10000 });
    });
  });
});
