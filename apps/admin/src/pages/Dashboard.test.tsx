import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard";

/** Dashboard de boas-vindas: nome/email + cards de papéis. Mock do useAuth. */
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({
    user: { name: "Ana Admin", email: "ana@markethub.com", roles: ["admin", "merchant"] },
  }),
}));

describe("Dashboard", () => {
  it("renderiza saudação, email e os papéis do usuário", () => {
    render(<Dashboard />);
    expect(screen.getByText("Olá, Ana Admin")).toBeInTheDocument();
    expect(screen.getByText("ana@markethub.com")).toBeInTheDocument();
    expect(screen.getByText("admin, merchant")).toBeInTheDocument();
    // cards estáticos das próximas fases
    expect(screen.getByText("Catálogo")).toBeInTheDocument();
    expect(screen.getByText("Pedidos")).toBeInTheDocument();
  });
});
