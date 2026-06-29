import React from "react";
import renderer, { act } from "react-test-renderer";
import { ApiClientError } from "@markethub/api-client";
import { AuthProvider, useAuth } from "../auth-context";

/**
 * Story 41: AuthProvider do app driver. Mocka o ApiClient (construtor → instância
 * fake controlável) e o expo-secure-store (SecureTokenStore). Cobre carga de
 * sessão (papel certo/errado/sem sessão), login (sucesso e gate de papel) e logout.
 */

const mockClient = {
  me: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
};

jest.mock("@markethub/api-client", () => {
  const actual = jest.requireActual("@markethub/api-client");
  return {
    ...actual,
    ApiClient: jest.fn().mockImplementation(() => mockClient),
  };
});

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const driverUser = { id: "u1", name: "Drv", email: "d@x.com", roles: ["driver"] };
const otherUser = { id: "u2", name: "Adm", email: "a@x.com", roles: ["admin"] };

type AuthValue = ReturnType<typeof useAuth>;

function renderProvider() {
  const captured: { current: AuthValue | null } = { current: null };
  function Consumer() {
    captured.current = useAuth();
    return null;
  }
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
  });
  return { captured, unmount: () => act(() => tree!.unmount()) };
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  mockClient.me.mockReset();
  mockClient.login.mockReset().mockResolvedValue(undefined);
  mockClient.logout.mockReset().mockResolvedValue(undefined);
});

describe("AuthProvider — carga de sessão", () => {
  it("sessão válida com papel driver popula o usuário", async () => {
    mockClient.me.mockResolvedValue(driverUser);
    const { captured, unmount } = renderProvider();
    await flush();
    expect(captured.current?.user?.name).toBe("Drv");
    expect(captured.current?.loading).toBe(false);
    unmount();
  });

  it("sessão com papel errado faz logout e não popula", async () => {
    mockClient.me.mockResolvedValue(otherUser);
    const { captured, unmount } = renderProvider();
    await flush();
    expect(mockClient.logout).toHaveBeenCalled();
    expect(captured.current?.user).toBeNull();
    expect(captured.current?.loading).toBe(false);
    unmount();
  });

  it("sem sessão (me rejeita) encerra o loading sem usuário", async () => {
    mockClient.me.mockRejectedValue(new Error("401"));
    const { captured, unmount } = renderProvider();
    await flush();
    expect(captured.current?.user).toBeNull();
    expect(captured.current?.loading).toBe(false);
    unmount();
  });
});

describe("AuthProvider — login", () => {
  it("login com papel driver autentica", async () => {
    mockClient.me.mockRejectedValueOnce(new Error("no session")); // loadSession inicial
    mockClient.me.mockResolvedValueOnce(driverUser); // me após login
    const { captured, unmount } = renderProvider();
    await flush();
    await act(async () => {
      await captured.current!.login("d@x.com", "pw");
    });
    expect(mockClient.login).toHaveBeenCalledWith({ email: "d@x.com", password: "pw" });
    expect(captured.current?.user?.name).toBe("Drv");
    unmount();
  });

  it("login com papel errado faz logout e lança WRONG_APP_ROLE", async () => {
    mockClient.me.mockRejectedValueOnce(new Error("no session"));
    mockClient.me.mockResolvedValueOnce(otherUser);
    const { captured, unmount } = renderProvider();
    await flush();
    let err: unknown;
    await act(async () => {
      try {
        await captured.current!.login("a@x.com", "pw");
      } catch (e) {
        err = e;
      }
    });
    expect(mockClient.logout).toHaveBeenCalled();
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).body.code).toBe("WRONG_APP_ROLE");
    expect(captured.current?.user).toBeNull();
    unmount();
  });
});

describe("AuthProvider — logout", () => {
  it("logout limpa o usuário", async () => {
    mockClient.me.mockResolvedValue(driverUser);
    const { captured, unmount } = renderProvider();
    await flush();
    expect(captured.current?.user?.name).toBe("Drv");
    await act(async () => {
      await captured.current!.logout();
    });
    expect(mockClient.logout).toHaveBeenCalled();
    expect(captured.current?.user).toBeNull();
    unmount();
  });
});

describe("useAuth", () => {
  it("fora do provider lança erro", () => {
    function Bare() {
      useAuth();
      return null;
    }
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => {
      act(() => {
        renderer.create(<Bare />);
      });
    }).toThrow("useAuth must be used within AuthProvider");
    spy.mockRestore();
  });
});
