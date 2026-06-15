import { expect, test } from "@playwright/test";

/**
 * C20: navegação do admin pelas áreas de operação — Pedidos, Operação e
 * Mercados. Prova que as rotas protegidas carregam (auth + layout + fetch da
 * API) sem quebrar. Requer api (:3000) + admin vite (:3001) no ar (ver C19).
 */
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("E-mail").fill("admin-web@test.dev");
  await page.getByPlaceholder("Senha").fill("Passw0rd!");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("link", { name: "Pedidos" })).toBeVisible();
});

test("abre Pedidos", async ({ page }) => {
  await page.getByRole("link", { name: "Pedidos" }).click();
  await expect(page.getByRole("heading", { name: "Pedidos" })).toBeVisible();
});

test("abre Operação", async ({ page }) => {
  await page.getByRole("link", { name: "Operação" }).click();
  await expect(page.getByRole("heading", { name: "Operação" })).toBeVisible();
});

test("abre Mercados", async ({ page }) => {
  await page.getByRole("link", { name: "Mercados" }).click();
  await expect(page.getByRole("heading", { name: "Mercados" })).toBeVisible();
});
