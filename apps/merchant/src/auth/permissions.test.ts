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

  it("manager: colaboradores + catálogo + ver lojas/pedidos/relatórios", () => {
    expect(can("manager", "stores.view")).toBe(true);
    expect(can("manager", "staff.manage")).toBe(true);
    expect(can("manager", "catalog.manage")).toBe(true);
    expect(can("manager", "orders.view")).toBe(true);
    expect(can("manager", "reports.view")).toBe(true);
  });

  it("manager NÃO gere integração nem cria lojas", () => {
    expect(can("manager", "integration.manage")).toBe(false);
    expect(can("manager", "stores.create")).toBe(false);
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

  it("sem papel (null/undefined) nega tudo", () => {
    expect(can(null, "stores.view")).toBe(false);
    expect(can(undefined, "catalog.manage")).toBe(false);
  });
});
