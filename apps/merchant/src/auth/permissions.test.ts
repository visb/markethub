import { describe, expect, it } from "vitest";
import { can } from "./permissions";

describe("can (matriz de permissão — story 07)", () => {
  it("owner tem todas as capacidades", () => {
    for (const cap of [
      "stores.view",
      "stores.create",
      "integration.manage",
      "staff.manage",
      "catalog.manage",
      "orders.view",
      "reports.view",
    ] as const) {
      expect(can("owner", cap)).toBe(true);
    }
  });

  it("orders.manage (cancelar sub-pedido — story 54) vale p/ owner, admin e manager", () => {
    expect(can("owner", "orders.manage")).toBe(true);
    expect(can("admin", "orders.manage")).toBe(true);
    expect(can("manager", "orders.manage")).toBe(true);
    expect(can(null, "orders.manage")).toBe(false);
  });

  it("manager: colaboradores + catálogo + ver lojas/pedidos/relatórios", () => {
    expect(can("manager", "stores.view")).toBe(true);
    expect(can("manager", "staff.manage")).toBe(true);
    expect(can("manager", "catalog.manage")).toBe(true);
    expect(can("manager", "orders.view")).toBe(true);
    expect(can("manager", "reports.view")).toBe(true);
  });

  it("manager NÃO gere integração, cupons nem cria lojas", () => {
    expect(can("manager", "integration.manage")).toBe(false);
    expect(can("manager", "stores.create")).toBe(false);
    expect(can("manager", "coupons.manage")).toBe(false);
  });

  it("owner e admin gerenciam cupons da rede (story 53)", () => {
    expect(can("owner", "coupons.manage")).toBe(true);
    expect(can("admin", "coupons.manage")).toBe(true);
  });

  it("admin (story 16): integração + equipe + catálogo, mas NÃO cria lojas", () => {
    expect(can("admin", "integration.manage")).toBe(true);
    expect(can("admin", "staff.manage")).toBe(true);
    expect(can("admin", "catalog.manage")).toBe(true);
    expect(can("admin", "vehicles.manage")).toBe(true);
    expect(can("admin", "orders.view")).toBe(true);
    expect(can("admin", "reports.view")).toBe(true);
    expect(can("admin", "stores.view")).toBe(true);
    expect(can("admin", "stores.create")).toBe(false);
  });

  it("slots.manage (agendamento — story 55) vale p/ owner, admin e manager", () => {
    expect(can("owner", "slots.manage")).toBe(true);
    expect(can("admin", "slots.manage")).toBe(true);
    expect(can("manager", "slots.manage")).toBe(true);
    expect(can(null, "slots.manage")).toBe(false);
  });

  it("sem papel (null/undefined) nega tudo", () => {
    expect(can(null, "stores.view")).toBe(false);
    expect(can(undefined, "catalog.manage")).toBe(false);
  });
});
