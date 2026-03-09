import { test, expect } from "@playwright/test";
import { signIn } from "./utils/auth";

test.describe("Space public API management", () => {
  test("allows toggling public API access and validates endpoint responses", async ({ page }) => {
    // Sign in to the application
    await signIn(page);

    // Navigate to spaces page to find a space
    await page.goto("/spaces");
    await expect(page.getByRole("heading", { name: /Spaces/i })).toBeVisible({ timeout: 10000 });

    // Look for a space card with "View" or similar action button
    const spaceCards = page.locator('[class*="card"]').filter({ hasText: /Reserve|Vault/i });
    const firstSpaceCard = spaceCards.first();

    // If no spaces exist, skip this test
    if (!(await firstSpaceCard.isVisible())) {
      test.skip();
      return;
    }

    // Get the space name
    const spaceHeading = firstSpaceCard.locator('h3, h2, [class*="heading"]').first();
    const spaceName = await spaceHeading.textContent();
    expect(spaceName).toBeTruthy();

    // Click on the card or find a view/open button
    const viewButton = firstSpaceCard.getByRole("link", { name: /View|Open|Details/i });
    if (await viewButton.isVisible()) {
      await viewButton.click();
    } else {
      // Try clicking on the heading
      await spaceHeading.click();
    }

    // Should be on the space dashboard (give it time to navigate)
    await page.waitForURL(/\/spaces\/[^/]+.*/, { timeout: 10000 });

    // Extract the space slug from the URL
    const spaceUrl = page.url();
    const spaceSlug = spaceUrl.split("/spaces/")[1]?.split("?")[0]?.split("/")[0];
    expect(spaceSlug).toBeTruthy();

    // Navigate to settings page
    await page.goto(`/spaces/${spaceSlug}/settings`);

    const publicApiSwitch = page.getByRole("switch", { name: "Public API Access" });
    const saveButton = page.getByRole("button", { name: "Save Changes" });

    // Get initial state
    const initiallyChecked = await publicApiSwitch.isChecked();

    // Toggle the public API switch
    await publicApiSwitch.click();

    // Verify it changed
    if (initiallyChecked) {
      await expect(publicApiSwitch).not.toBeChecked();
    } else {
      await expect(publicApiSwitch).toBeChecked();
    }

    // Save button should be enabled after change
    await expect(saveButton).toBeEnabled();

    // Save the changes
    await saveButton.click();

    // Wait for save to complete (button should be disabled)
    await expect(saveButton).toBeDisabled({ timeout: 5000 });

    // Verify the API endpoint behaves according to the new setting
    const apiIdentifier = spaceSlug; // Assuming slug is used as API identifier
    const apiResponse = await page.evaluate(async (identifier) => {
      const response = await fetch(`/api/v1/reserves/${identifier}`);
      return {
        status: response.status,
        ok: response.ok,
      };
    }, apiIdentifier);

    if (initiallyChecked) {
      // Was public, now should require API key (401)
      expect(apiResponse.status).toBe(401);
    } else {
      // Was private, now should be public (200 or 404 if no reserves)
      expect([200, 404]).toContain(apiResponse.status);
    }

    // Toggle back to original state
    await publicApiSwitch.click();

    if (initiallyChecked) {
      await expect(publicApiSwitch).toBeChecked();
    } else {
      await expect(publicApiSwitch).not.toBeChecked();
    }

    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(saveButton).toBeDisabled({ timeout: 5000 });

    // Verify API is back to original state
    const restoredApiResponse = await page.evaluate(async (identifier) => {
      const response = await fetch(`/api/v1/reserves/${identifier}`);
      return {
        status: response.status,
        ok: response.ok,
      };
    }, apiIdentifier);

    if (initiallyChecked) {
      // Should be public again (200 or 404 if no reserves)
      expect([200, 404]).toContain(restoredApiResponse.status);
    } else {
      // Should require API key again (401)
      expect(restoredApiResponse.status).toBe(401);
    }
  });
});
