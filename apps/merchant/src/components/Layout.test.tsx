import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { MerchantRole } from "@markethub/api-client";

const logout = vi.fn();
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ user: { name: "Fulano" }, logout }),
}));

let role: MerchantRole | null = "owner";
vi.mock("@/api/hooks/useMerchantContext", () => ({
  useMerchantContext: () => ({ data: role ? { role, merchantId: "m1", stores: [] } : undefined }),
}));

import { Layout } from "./Layout";

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout />
    </MemoryRouter>,
  );
}

describe("Layout — nav gated por can() (story 07)", () => {
  it("owner vê todos os itens (incl. Integração)", () => {
    role = "owner";
    renderLayout();
    for (const label of ["Lojas", "Integração", "Colaboradores", "Catálogo", "Pedidos", "Relatórios"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText(/Dono/)).toBeInTheDocument();
  });

  it("manager NÃO vê Integração, vê os demais", () => {
    role = "manager";
    renderLayout();
    expect(screen.queryByRole("link", { name: "Integração" })).not.toBeInTheDocument();
    for (const label of ["Lojas", "Colaboradores", "Catálogo", "Pedidos", "Relatórios"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText(/Gerente/)).toBeInTheDocument();
  });
});
