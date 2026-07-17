import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useChangePassword, useMe, useUpdateMe } from "../api/hooks/useAccount";
import { queryKeys } from "../lib/queryKeys";

/**
 * Story 70: hooks de conta/perfil. ApiClient mockado via useAuth
 * (me/updateMe/changeMyPassword). Valida a key centralizada, o fetch do perfil
 * e a escrita do cache no sucesso do update. Espelha useStoreFollow.test.tsx.
 */

const ME = { id: "u1", name: "Ana", email: "a@b.com", phone: "41999991234", roles: ["customer"] };

const mockMe = jest.fn();
const mockUpdateMe = jest.fn();
const mockChangePassword = jest.fn();

jest.mock("@/auth-context", () => ({
  useAuth: () => ({
    api: {
      me: (...a: unknown[]) => mockMe(...a),
      updateMe: (...a: unknown[]) => mockUpdateMe(...a),
      changeMyPassword: (...a: unknown[]) => mockChangePassword(...a),
    },
  }),
}));

let activeClient: QueryClient | null = null;

function renderHook<T>(useHook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  activeClient = client;
  const result: { current: T | null } = { current: null };
  function Probe() {
    result.current = useHook();
    return null;
  }
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  return { result, client, unmount: () => { act(() => tree!.unmount()); client.clear(); } };
}

async function waitFor(predicate: () => boolean, tries = 50) {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
  if (!predicate()) throw new Error("waitFor: condição não satisfeita");
}

beforeEach(() => {
  mockMe.mockReset().mockResolvedValue(ME);
  mockUpdateMe.mockReset().mockResolvedValue({ ...ME, name: "Ana Maria" });
  mockChangePassword.mockReset().mockResolvedValue({ ok: true, revokedSessions: 1 });
});
afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("queryKeys.account (não-literal)", () => {
  it("expõe a key do perfil", () => {
    expect(queryKeys.account.me).toEqual(["account", "me"]);
  });
});

describe("useMe (story 70)", () => {
  it("busca o perfil via api.me e grava na key account.me", async () => {
    const { result, client, unmount } = renderHook(() => useMe());
    await waitFor(() => result.current?.data !== undefined);
    expect(mockMe).toHaveBeenCalledTimes(1);
    expect(result.current!.data).toEqual(ME);
    expect(client.getQueryData(queryKeys.account.me)).toEqual(ME);
    unmount();
  });

  it("enabled: false não dispara o fetch", async () => {
    const { result, unmount } = renderHook(() => useMe({ enabled: false }));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(mockMe).not.toHaveBeenCalled();
    expect(result.current!.data).toBeUndefined();
    unmount();
  });
});

describe("useUpdateMe (story 70)", () => {
  it("PATCH parcial e sucesso atualiza o cache do perfil", async () => {
    const { result, client, unmount } = renderHook(() => useUpdateMe());
    await act(async () => {
      await result.current!.mutateAsync({ name: "Ana Maria" });
    });
    expect(mockUpdateMe).toHaveBeenCalledWith({ name: "Ana Maria" });
    expect(client.getQueryData(queryKeys.account.me)).toEqual({ ...ME, name: "Ana Maria" });
    unmount();
  });

  it("erro não escreve no cache", async () => {
    mockUpdateMe.mockRejectedValueOnce(new Error("boom"));
    const { result, client, unmount } = renderHook(() => useUpdateMe());
    await act(async () => {
      await result.current!.mutateAsync({ phone: null }).catch(() => undefined);
    });
    expect(client.getQueryData(queryKeys.account.me)).toBeUndefined();
    unmount();
  });
});

describe("useChangePassword (story 70)", () => {
  it("delega ao api.changeMyPassword", async () => {
    const { result, unmount } = renderHook(() => useChangePassword());
    await act(async () => {
      await result.current!.mutateAsync({ currentPassword: "velha123", newPassword: "nova1234" });
    });
    expect(mockChangePassword).toHaveBeenCalledWith({
      currentPassword: "velha123",
      newPassword: "nova1234",
    });
    unmount();
  });
});
