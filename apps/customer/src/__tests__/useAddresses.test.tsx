import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useAddAddress,
  useAddresses,
  useRemoveAddress,
  useSetDefaultAddress,
  useUpdateAddress,
} from "../api/hooks/useAddresses";
import { queryKeys } from "../lib/queryKeys";
import type { Address } from "../api/marketplace";

/**
 * Story 71: hooks do livro de endereços — query central + mutations
 * (criar/editar/remover/tornar padrão) com invalidação da key após cada
 * escrita. ApiClient falso via useAuth; espelha useAccount.test.tsx.
 */

const mockRequest = jest.fn();
jest.mock("@/auth-context", () => ({
  useAuth: () => ({ api: { request: (...a: unknown[]) => mockRequest(...a) } }),
}));

function addr(over: Partial<Address>): Address {
  return {
    id: "a1", label: "Casa", street: "Rua A", number: "10", city: "Curitiba", state: "PR",
    zipCode: "80000-000", latitude: -25, longitude: -49, isDefault: false, ...over,
  };
}

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
  mockRequest.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("useAddresses (query)", () => {
  it("busca GET /addresses na key central e expõe o endereço ativo (default)", async () => {
    const list = [addr({ id: "a1" }), addr({ id: "a2", label: "Trabalho", isDefault: true })];
    mockRequest.mockResolvedValue(list);
    const { result, client, unmount } = renderHook(() => useAddresses());
    await waitFor(() => result.current!.addresses.length === 2);
    expect(mockRequest).toHaveBeenCalledWith("/addresses", { auth: true });
    expect(client.getQueryData(queryKeys.addresses.all)).toEqual(list);
    expect(result.current!.activeAddress?.id).toBe("a2");
    expect(result.current!.loading).toBe(false);
    unmount();
  });
});

describe("mutations do livro de endereços (story 71)", () => {
  it("useAddAddress: POST /addresses e invalida a lista", async () => {
    const { result, client, unmount } = renderHook(() => useAddAddress());
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const body = { label: "Casa", street: "Rua A", number: "10" };
    await act(async () => {
      await result.current!.mutateAsync(body);
    });
    expect(mockRequest).toHaveBeenCalledWith("/addresses", { method: "POST", auth: true, body });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.addresses.all });
    unmount();
  });

  it("useUpdateAddress: PATCH /addresses/:id e invalida a lista", async () => {
    const { result, client, unmount } = renderHook(() => useUpdateAddress("a7"));
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const body = { number: "22" };
    await act(async () => {
      await result.current!.mutateAsync(body);
    });
    expect(mockRequest).toHaveBeenCalledWith("/addresses/a7", { method: "PATCH", auth: true, body });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.addresses.all });
    unmount();
  });

  it("useRemoveAddress: DELETE /addresses/:id e invalida a lista", async () => {
    const { result, client, unmount } = renderHook(() => useRemoveAddress());
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await act(async () => {
      await result.current!.mutateAsync("a3");
    });
    expect(mockRequest).toHaveBeenCalledWith("/addresses/a3", { method: "DELETE", auth: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.addresses.all });
    unmount();
  });

  it("useSetDefaultAddress: POST /addresses/:id/default e invalida a lista", async () => {
    const { result, client, unmount } = renderHook(() => useSetDefaultAddress());
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await act(async () => {
      await result.current!.mutateAsync("a4");
    });
    expect(mockRequest).toHaveBeenCalledWith("/addresses/a4/default", { method: "POST", auth: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.addresses.all });
    unmount();
  });

  it("erro na mutation não invalida a lista", async () => {
    mockRequest.mockRejectedValueOnce(new Error("boom"));
    const { result, client, unmount } = renderHook(() => useRemoveAddress());
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await act(async () => {
      await result.current!.mutateAsync("a3").catch(() => undefined);
    });
    expect(invalidate).not.toHaveBeenCalled();
    unmount();
  });
});
