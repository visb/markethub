import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "./ProtectedRoute";

/**
 * Story 37 — guarda de rota: substitui o middleware de auth. Sem sessão
 * redireciona p/ /login; carregando mostra placeholder; autenticado libera.
 */

const authState = { user: null as { name: string } | null, loading: false };
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => authState,
}));

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/secreto"]}>
      <Routes>
        <Route path="/login" element={<div>tela de login</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/secreto" element={<div>area protegida</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("mostra placeholder enquanto carrega a sessão", () => {
    authState.user = null;
    authState.loading = true;
    renderAt();
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
    expect(screen.queryByText("area protegida")).not.toBeInTheDocument();
  });

  it("sem sessão redireciona para /login", () => {
    authState.user = null;
    authState.loading = false;
    renderAt();
    expect(screen.getByText("tela de login")).toBeInTheDocument();
    expect(screen.queryByText("area protegida")).not.toBeInTheDocument();
  });

  it("autenticado renderiza a rota filha (Outlet)", () => {
    authState.user = { name: "Admin" };
    authState.loading = false;
    renderAt();
    expect(screen.getByText("area protegida")).toBeInTheDocument();
  });
});
