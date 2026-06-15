import { expect, test } from "@playwright/test";

/**
 * C25: customer (Expo web) — login e chegada na home. O fluxo completo de
 * compra (produto→carrinho→checkout) depende de um feed geolocalizado semeado;
 * aqui cobrimos auth + montagem da home autenticada (a busca aparece). Requer
 * api (:3000, DATABASE_URL teste) + customer web (:8081) no ar e o usuário
 * customer-web@test.dev semeado.
 */
test("customer loga e chega na home autenticada", async ({ page }) => {
  await page.goto("/");

  await page.getByPlaceholder("E-mail").fill("customer-web@test.dev");
  await page.getByPlaceholder("Senha").fill("Passw0rd!");
  await page.getByText("Entrar").click();

  await expect(
    page.getByPlaceholder("Busque por produtos, marcas ou departamento..."),
  ).toBeVisible({ timeout: 60_000 });
});
