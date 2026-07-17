import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * Story 69: tela bloqueante de rede suspensa — mensagem "contate a plataforma",
 * aviso de que pedidos em voo seguem e SÓ o logout disponível.
 */
const logout = vi.fn();
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ logout }),
}));

import { SuspendedNotice } from "./SuspendedNotice";

describe("SuspendedNotice", () => {
  it("mostra o motivo, o aviso de pedidos em voo e apenas o botão Sair", () => {
    render(<SuspendedNotice />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Rede suspensa")).toBeInTheDocument();
    expect(screen.getByText(/suporte do MarketHub/)).toBeInTheDocument();
    expect(screen.getByText(/Pedidos em andamento continuam/)).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("Sair chama o logout", () => {
    render(<SuspendedNotice />);
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(logout).toHaveBeenCalled();
  });
});
