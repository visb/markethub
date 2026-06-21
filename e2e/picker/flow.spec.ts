import { expect, test } from "@playwright/test";

/**
 * C26: picker (Expo web) — login e chegada na home do separador (saudação +
 * loja vinculada). O fluxo task→pick depende de um pedido pago com PickTask
 * na fila (pipeline completo); aqui cobrimos auth + montagem da área autenticada.
 * Requer api (:3000) + picker web (:8082) e picker-web@test.dev + StoreStaff
 * semeados.
 */
test("picker loga e vê a home do separador", async ({ page }) => {
  await page.goto("/");

  await page.getByPlaceholder("E-mail").fill("picker-web@test.dev");
  await page.getByPlaceholder("Senha").fill("Passw0rd!");
  await page.getByText("Entrar").click();

  await expect(page.getByText(/Olá, Separador Web/)).toBeVisible({ timeout: 60_000 });
});
