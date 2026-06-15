import { expect, test } from "@playwright/test";

/**
 * C27: driver (Expo web) — login e chegada na home do entregador (saudação +
 * loja vinculada). O fluxo de entrega (coleta/entrega) depende de uma Delivery
 * atribuída (pipeline completo); aqui cobrimos auth + montagem da área. Requer
 * api (:3000) + driver web (:8083) e driver-web@test.dev + StoreStaff semeados.
 */
test("driver loga e vê a home do entregador", async ({ page }) => {
  await page.goto("/");

  await page.getByPlaceholder("E-mail").fill("driver-web@test.dev");
  await page.getByPlaceholder("Senha").fill("Passw0rd!");
  await page.getByText("Entrar").click();

  await expect(page.getByText(/Olá, Entregador Web/)).toBeVisible({ timeout: 60_000 });
});
