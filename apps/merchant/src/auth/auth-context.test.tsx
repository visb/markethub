import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

// ApiClient mockado: controlamos me()/login()/logout()/merchantContext() por teste.
const me = vi.fn();
const login = vi.fn();
const logout = vi.fn();
const merchantContext = vi.fn();

vi.mock("@markethub/api-client", () => {
  class FakeApiClientError extends Error {
    constructor(
      public readonly status: number,
      public readonly body: { code: string; message: string },
    ) {
      super(body.message);
    }
  }
  class FakeApiClient {
    me = me;
    login = login;
    logout = logout;
    merchantContext = merchantContext;
  }
  return {
    ApiClient: FakeApiClient,
    ApiClientError: FakeApiClientError,
    // story 12: o auth-context cria o cliente de socket; mock sem rede.
    createRealtimeClient: () => ({
      connected: false,
      on: vi.fn(),
      emit: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      subscribeStore: vi.fn(),
      subscribeOrder: vi.fn(),
    }),
  };
});

import { ApiClientError } from "@markethub/api-client";
import { AuthProvider, useAuth } from "./auth-context";
const FakeApiClientError = ApiClientError as unknown as new (
  status: number,
  body: { code: string; message: string },
) => Error;

function Probe() {
  const { user, loading, login: doLogin } = useAuth();
  return (
    <div>
      <span data-testid="state">
        {loading ? "loading" : user ? `user:${user.email}` : "anon"}
      </span>
      <button onClick={() => void doLogin("a@b.dev", "pw").catch(() => undefined)}>go</button>
    </div>
  );
}

function setup() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

const ownerUser = { id: "u1", email: "owner@m.dev", name: "Owner", roles: ["merchant"] };
const managerUser = { id: "u2", email: "mgr@m.dev", name: "Mgr", roles: ["customer"] };
const customerUser = { id: "u3", email: "c@c.dev", name: "Cli", roles: ["customer"] };

describe("AuthProvider (story 07)", () => {
  beforeEach(() => {
    me.mockReset();
    login.mockReset();
    logout.mockReset().mockResolvedValue(undefined);
    merchantContext.mockReset();
  });

  it("sessão existente de owner (RoleName merchant) é mantida", async () => {
    me.mockResolvedValue(ownerUser);
    setup();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("user:owner@m.dev"));
    expect(merchantContext).not.toHaveBeenCalled(); // atalho local p/ RoleName merchant
  });

  it("sessão de manager (sem RoleName merchant) confirma acesso via merchantContext", async () => {
    me.mockResolvedValue(managerUser);
    merchantContext.mockResolvedValue({ role: "manager", merchantId: "m1", stores: [] });
    setup();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("user:mgr@m.dev"));
    expect(merchantContext).toHaveBeenCalled();
  });

  it("sem sessão válida → anon e logout chamado", async () => {
    me.mockResolvedValue(customerUser);
    merchantContext.mockRejectedValue(new FakeApiClientError(403, { code: "X", message: "no" }));
    setup();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("anon"));
    expect(logout).toHaveBeenCalled();
  });

  it("login de usuário sem acesso lança e desloga", async () => {
    me.mockResolvedValueOnce(null as never); // boot sem sessão
    setup();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("anon"));

    login.mockResolvedValue(undefined);
    me.mockResolvedValue(customerUser);
    merchantContext.mockRejectedValue(new FakeApiClientError(403, { code: "X", message: "no" }));

    await userEvent.click(screen.getByRole("button", { name: "go" }));
    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(screen.getByTestId("state")).toHaveTextContent("anon");
  });

  it("login de owner autentica", async () => {
    me.mockResolvedValueOnce(null as never);
    setup();
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("anon"));

    login.mockResolvedValue(undefined);
    me.mockResolvedValue(ownerUser);
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("user:owner@m.dev"));
  });
});
