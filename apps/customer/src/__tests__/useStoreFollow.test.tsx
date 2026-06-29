import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient } from "@markethub/api-client";
import { useStoreFollow, useToggleStoreFollow } from "../api/hooks/useStoreFollow";
import { queryKeys } from "../lib/queryKeys";

/**
 * Story 34: hooks de seguir loja. Mocka o módulo marketplace
 * (followStore/unfollowStore) e useAuth. Valida a key correta, a chamada
 * follow/unfollow conforme o estado atual e a atualização otimista do cache.
 * Espelha useProductDetail.test.tsx.
 */

const mockFollow = jest.fn();
const mockUnfollow = jest.fn();

jest.mock("../api/marketplace", () => {
  const actual = jest.requireActual("../api/marketplace");
  return {
    ...actual,
    marketplace: () => ({
      followStore: (...a: unknown[]) => mockFollow(...a),
      unfollowStore: (...a: unknown[]) => mockUnfollow(...a),
    }),
  };
});

jest.mock("@/auth-context", () => ({ useAuth: () => ({ api: {} as ApiClient }) }));

let activeClient: QueryClient | null = null;

function renderHook<T>(useHook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
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
  mockFollow.mockReset().mockResolvedValue({ id: "f1" });
  mockUnfollow.mockReset().mockResolvedValue({ storeId: "s1", removed: true });
});
afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("queryKeys.storeFollows (não-literal)", () => {
  it("expõe all e status(storeId)", () => {
    expect(queryKeys.storeFollows.all).toEqual(["store-follows"]);
    expect(queryKeys.storeFollows.status("s1")).toEqual(["store-follows", "status", "s1"]);
  });
});

describe("useToggleStoreFollow (story 34)", () => {
  it("não seguia (current false) → followStore + cache true + invalida all", async () => {
    const { result, client, unmount } = renderHook(() => useToggleStoreFollow("s1"));
    const spy = jest.spyOn(client, "invalidateQueries");
    await act(async () => {
      await result.current!.mutateAsync(false);
    });
    expect(mockFollow).toHaveBeenCalledWith("s1");
    expect(mockUnfollow).not.toHaveBeenCalled();
    expect(client.getQueryData(queryKeys.storeFollows.status("s1"))).toBe(true);
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.storeFollows.all });
    unmount();
  });

  it("já seguia (current true) → unfollowStore + cache false", async () => {
    const { result, client, unmount } = renderHook(() => useToggleStoreFollow("s1"));
    await act(async () => {
      await result.current!.mutateAsync(true);
    });
    expect(mockUnfollow).toHaveBeenCalledWith("s1");
    expect(mockFollow).not.toHaveBeenCalled();
    expect(client.getQueryData(queryKeys.storeFollows.status("s1"))).toBe(false);
    unmount();
  });

  it("erro no follow não grava status confirmado no cache", async () => {
    mockFollow.mockRejectedValueOnce(new Error("boom"));
    const { result, client, unmount } = renderHook(() => useToggleStoreFollow("s1"));
    await act(async () => {
      await result.current!.mutateAsync(false).catch(() => undefined);
    });
    // onSuccess não roda no erro → cache permanece sem status confirmado
    expect(client.getQueryData(queryKeys.storeFollows.status("s1"))).toBeUndefined();
    unmount();
  });
});

describe("useStoreFollow (story 34)", () => {
  it("following reflete o estado inicial do sections", () => {
    const { result, unmount } = renderHook(() => useStoreFollow("s1", true));
    expect(result.current!.following).toBe(true);
    unmount();
  });

  it("alterna ao acionar: not following → segue e following vira true", async () => {
    const { result, unmount } = renderHook(() => useStoreFollow("s1", false));
    expect(result.current!.following).toBe(false);
    await act(async () => {
      result.current!.toggle();
    });
    await waitFor(() => result.current!.following === true);
    expect(mockFollow).toHaveBeenCalledWith("s1");
    expect(mockUnfollow).not.toHaveBeenCalled();
    expect(result.current!.following).toBe(true);
    unmount();
  });

  it("erro ao seguir faz rollback do estado otimista", async () => {
    mockFollow.mockRejectedValueOnce(new Error("boom"));
    const { result, unmount } = renderHook(() => useStoreFollow("s1", false));
    await act(async () => {
      result.current!.toggle();
    });
    await waitFor(() => result.current!.isToggling === false);
    expect(result.current!.following).toBe(false); // voltou ao inicial
    unmount();
  });
});
