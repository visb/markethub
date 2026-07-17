import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantRole } from "@markethub/api-client";

const logout = vi.fn();
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ user: { name: "Fulano" }, logout }),
}));

let role: MerchantRole | null = "owner";
let suspended = false;
vi.mock("@/api/hooks/useMerchantContext", () => ({
  useMerchantContext: () => ({
    data: role
      ? { role, merchantId: "m1", stores: [], merchantSuspended: suspended }
      : undefined,
  }),
}));

import { Layout } from "./Layout";

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  suspended = false;
});

describe("Layout — nav gated por can() (story 07)", () => {
  it("owner vê todos os itens (incl. Integração)", () => {
    role = "owner";
    renderLayout();
    for (const label of ["Lojas", "Integração", "Colaboradores", "Cupons", "Catálogo", "Pedidos", "Relatórios"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText(/Dono/)).toBeInTheDocument();
  });

  it("manager NÃO vê Integração, vê os demais", () => {
    role = "manager";
    renderLayout();
    expect(screen.queryByRole("link", { name: "Integração" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Cupons" })).not.toBeInTheDocument();
    for (const label of ["Lojas", "Colaboradores", "Catálogo", "Pedidos", "Relatórios"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText(/Gerente/)).toBeInTheDocument();
  });

  it("admin (story 16) VÊ Integração e é rotulado 'Administrador'", () => {
    role = "admin";
    renderLayout();
    expect(screen.getByRole("link", { name: "Integração" })).toBeInTheDocument();
    for (const label of ["Lojas", "Colaboradores", "Catálogo", "Pedidos", "Relatórios"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText(/Administrador/)).toBeInTheDocument();
  });
});

// Story 69: rede suspensa substitui o painel inteiro pela tela bloqueante.
describe("Layout — rede suspensa (story 69)", () => {
  it("merchantSuspended true → tela bloqueante no lugar do shell (sem nav)", () => {
    role = "owner";
    suspended = true;
    renderLayout();
    expect(screen.getByText("Rede suspensa")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Lojas" })).not.toBeInTheDocument();
    expect(screen.queryByText("Painel do mercado", { exact: false })).not.toBeInTheDocument();
    // só o logout fica disponível
    expect(screen.getByRole("button", { name: "Sair" })).toBeInTheDocument();
  });

  it("merchantSuspended false → painel normal", () => {
    role = "owner";
    renderLayout();
    expect(screen.queryByText("Rede suspensa")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lojas" })).toBeInTheDocument();
  });
});
