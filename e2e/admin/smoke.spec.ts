import { test, expect } from "@playwright/test";

test("admin web carrega e mostra tela de login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "MarketHub" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});
