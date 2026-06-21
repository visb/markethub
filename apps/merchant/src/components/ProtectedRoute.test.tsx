import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

let state: { user: unknown; loading: boolean };
vi.mock("@/auth/auth-context", () => ({ useAuth: () => state }));

import { ProtectedRoute } from "./ProtectedRoute";

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/secret"]}>
      <Routes>
        <Route path="/login" element={<div>login-page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/secret" element={<div>secret-page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("spinner enquanto carrega", () => {
    state = { user: null, loading: true };
    renderAt();
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("redireciona p/ login sem usuário", () => {
    state = { user: null, loading: false };
    renderAt();
    expect(screen.getByText("login-page")).toBeInTheDocument();
  });

  it("renderiza a rota protegida quando autenticado", () => {
    state = { user: { id: "u1" }, loading: false };
    renderAt();
    expect(screen.getByText("secret-page")).toBeInTheDocument();
  });
});
