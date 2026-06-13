import { test, expect } from "@playwright/test";

test("driver web monta a aplicação", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#root")).not.toBeEmpty();
});
