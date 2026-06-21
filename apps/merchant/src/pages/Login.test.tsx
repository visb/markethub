import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Login } from "./Login";

const login = vi.fn();
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ login }),
}));

describe("Login (story 07)", () => {
  it("renderiza o formulário", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "MarketHub" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("E-mail")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Senha")).toBeInTheDocument();
  });

  it("valida (zod): campos vazios bloqueiam o submit", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Informe o e-mail")).toBeInTheDocument();
    expect(screen.getByText("Informe a senha")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("chama login com credenciais válidas", async () => {
    login.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    await user.type(screen.getByPlaceholderText("E-mail"), "dono@merc.dev");
    await user.type(screen.getByPlaceholderText("Senha"), "Senha123!");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(login).toHaveBeenCalledWith("dono@merc.dev", "Senha123!"));
  });
});
