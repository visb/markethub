import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClientOptions } from "@markethub/api-client";
import { AuthProvider, useAuth } from "./auth-context";

/**
 * Story 37 — fundação do painel: o AuthProvider é o wrapper do ApiClient
 * compartilhado (camada de dados de fato do admin, que ainda não usa React
 * Query — desvio sistêmico B20). Cobre bootstrap de sessão, login ok/erro,
 * controle de acesso ao painel, logout e expiração (onAuthError).
 */

const apiMock = {
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
};
let lastOpts: ApiClientOptions | undefined;

vi.mock("@markethub/api-client", async (orig) => {
  const actual = await orig<typeof import("@markethub/api-client")>();
  class FakeApiClient {
    me = (...args: unknown[]) => apiMock.me(...args);
    login = (...args: unknown[]) => apiMock.login(...args);
    logout = (...args: unknown[]) => apiMock.logout(...args);
    constructor(opts: ApiClientOptions) {
      lastOpts = opts;
    }
  }
  return { ...actual, ApiClient: FakeApiClient };
});

const ADMIN = { id: "u1", name: "Admin", email: "a@x.com", roles: ["admin"] };
const CUSTOMER = { id: "u2", name: "Cliente", email: "c@x.com", roles: ["customer"] };

let thrown: unknown;

function Consumer() {
  const { user, loading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.name : "none"}</span>
      <button
        onClick={() => {
          thrown = undefined;
          void login("a@x.com", "pw").catch((err) => {
            thrown = err;
          });
        }}
      >
        login
      </button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    lastOpts = undefined;
    thrown = undefined;
    apiMock.me.mockReset();
    apiMock.login.mockReset();
    apiMock.logout.mockReset();
    apiMock.logout.mockResolvedValue(undefined);
    apiMock.login.mockResolvedValue(undefined);
  });

  it("bootstrap: sessão válida com acesso ao painel popula o user e encerra o loading", async () => {
    apiMock.me.mockResolvedValue(ADMIN);
    renderProvider();

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("user")).toHaveTextContent("Admin");
    expect(apiMock.logout).not.toHaveBeenCalled();
  });

  it("bootstrap: sessão sem acesso ao painel faz logout e não popula o user", async () => {
    apiMock.me.mockResolvedValue(CUSTOMER);
    renderProvider();

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(apiMock.logout).toHaveBeenCalledTimes(1);
  });

  it("bootstrap: sem sessão (me rejeita) deixa o user nulo", async () => {
    apiMock.me.mockRejectedValue(new Error("401"));
    renderProvider();

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("login: sucesso com acesso ao painel popula o user", async () => {
    apiMock.me.mockRejectedValueOnce(new Error("no session")).mockResolvedValue(ADMIN);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

    await userEvent.click(screen.getByRole("button", { name: "login" }));

    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("Admin"));
    expect(apiMock.login).toHaveBeenCalledWith({ email: "a@x.com", password: "pw" });
  });

  it("login: conta sem acesso ao painel desloga e lança NO_PANEL_ACCESS", async () => {
    apiMock.me.mockRejectedValueOnce(new Error("no session")).mockResolvedValue(CUSTOMER);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

    await userEvent.click(screen.getByRole("button", { name: "login" }));

    await waitFor(() => expect(thrown).toBeTruthy());
    expect((thrown as { body: { code: string } }).body.code).toBe("NO_PANEL_ACCESS");
    expect(apiMock.logout).toHaveBeenCalled();
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("login: erro de credencial propaga e mantém user nulo", async () => {
    apiMock.me.mockRejectedValueOnce(new Error("no session"));
    apiMock.login.mockRejectedValue(new Error("INVALID_CREDENTIALS"));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

    await userEvent.click(screen.getByRole("button", { name: "login" }));

    await waitFor(() => expect(thrown).toBeTruthy());
    expect(apiMock.me).toHaveBeenCalledTimes(1); // só o bootstrap; login falhou antes do me
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("logout zera o user", async () => {
    apiMock.me.mockResolvedValue(ADMIN);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("Admin"));

    await userEvent.click(screen.getByRole("button", { name: "logout" }));

    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("none"));
    expect(apiMock.logout).toHaveBeenCalled();
  });

  it("onAuthError (sessão expirada) zera o user", async () => {
    apiMock.me.mockResolvedValue(ADMIN);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("Admin"));

    act(() => lastOpts?.onAuthError?.());

    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("none"));
  });

  it("useAuth fora do provider lança erro", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Consumer />)).toThrow(/useAuth must be used within AuthProvider/);
    spy.mockRestore();
  });
});
