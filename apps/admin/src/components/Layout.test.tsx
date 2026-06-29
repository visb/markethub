import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Layout } from "./Layout";

/**
 * Story 37 — shell/layout: a navegação muda conforme o papel (admin x manager),
 * marca o item ativo pela rota e o botão Sair chama logout.
 */

const logout = vi.fn();
const authState = { user: { name: "Fulano", roles: ["admin"] } as { name: string; roles: string[] }, logout };
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => authState,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<div>conteudo</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Layout", () => {
  beforeEach(() => {
    logout.mockReset();
    authState.user = { name: "Fulano", roles: ["admin"] };
  });

  it("admin vê a navegação global e o nome do usuário", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByText("Mercados")).toBeInTheDocument();
    expect(within(nav).getByText("Pedidos")).toBeInTheDocument();
    expect(within(nav).getByText("Usuários")).toBeInTheDocument();
    expect(within(nav).queryByText("Ofertas")).not.toBeInTheDocument();
    expect(screen.getByText("Fulano")).toBeInTheDocument();
  });

  it("manager vê apenas a navegação da loja", () => {
    authState.user = { name: "Gerente", roles: ["merchant"] };
    renderAt("/merchant/offers");
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByText("Ofertas")).toBeInTheDocument();
    expect(within(nav).getByText("Estoque")).toBeInTheDocument();
    expect(within(nav).queryByText("Mercados")).not.toBeInTheDocument();
  });

  it("marca como ativo o item da rota atual", () => {
    renderAt("/orders");
    expect(screen.getByText("Pedidos").className).toContain("active");
    expect(screen.getByText("Mercados").className).not.toContain("active");
  });

  it("o link 'Visão geral' (end) não fica ativo em sub-rotas", () => {
    renderAt("/orders");
    expect(screen.getByText("Visão geral").className).not.toContain("active");
  });

  it("o botão Sair chama logout", async () => {
    renderAt("/");
    await userEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
