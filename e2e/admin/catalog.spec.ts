import { expect, test } from "@playwright/test";

/**
 * C19: fluxo admin login → catálogo → editar produto. Requer a API rodando
 * (DATABASE_URL de teste) com um admin (admin-web@test.dev) e um produto
 * "Produto E2E Web" semeados — ver RUNBOOK/PROGRESS C19.
 */
test("admin loga, abre o catálogo e edita um produto", async ({ page }) => {
  await page.goto("/");

  // login
  await page.getByPlaceholder("E-mail").fill("admin-web@test.dev");
  await page.getByPlaceholder("Senha").fill("Passw0rd!");
  await page.getByRole("button", { name: "Entrar" }).click();

  // navega ao catálogo
  await page.getByRole("link", { name: "Catálogo" }).click();
  await page.getByPlaceholder("Buscar nome, marca, GTIN…").fill("Produto E2E Web");

  // abre o detalhe do produto
  await page.getByRole("link", { name: "Produto E2E Web" }).click();
  await expect(page.getByRole("heading", { name: "Produto E2E Web" })).toBeVisible();

  // edita a marca e salva
  await page.locator('label', { hasText: "brand" }).locator("input").fill("Marca E2E");
  await page.getByRole("button", { name: "Salvar" }).click();

  // confirmação de save (campos alterados travados contra enriquecimento)
  await expect(page.getByText(/Salvo/)).toBeVisible();
});
