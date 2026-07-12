import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantStoreDetailDTO } from "@markethub/api-client";

const merchantStoresDetail = vi.fn();
const merchantCreateStore = vi.fn();
const merchantUpdateStore = vi.fn();
const merchantPauseStore = vi.fn();
const merchantResumeStore = vi.fn();
let user: { id: string } | null = { id: "u1" };

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({
    api: {
      merchantStoresDetail,
      merchantCreateStore,
      merchantUpdateStore,
      merchantPauseStore,
      merchantResumeStore,
    },
    user,
  }),
}));

import { useCreateStore, useStores, useTogglePauseStore, useUpdateStore } from "./useStores";

const store: MerchantStoreDetailDTO = {
  id: "s1",
  merchantId: "m1",
  name: "Loja",
  externalId: null,
  street: null,
  number: null,
  district: null,
  city: null,
  state: null,
  zipCode: null,
  latitude: null,
  longitude: null,
  avgPrepMinutes: 15,
  active: true,
  pausedAt: null,
};

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useStores hooks (story 08)", () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    merchantStoresDetail.mockReset();
    merchantCreateStore.mockReset();
    merchantUpdateStore.mockReset();
    merchantPauseStore.mockReset();
    merchantResumeStore.mockReset();
    user = { id: "u1" };
  });

  it("useStores busca a lista detalhada", async () => {
    merchantStoresDetail.mockResolvedValueOnce([store]);
    const { result } = renderHook(() => useStores(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([store]);
  });

  it("useStores não busca sem usuário", () => {
    user = null;
    const { result } = renderHook(() => useStores(), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(merchantStoresDetail).not.toHaveBeenCalled();
  });

  it("useCreateStore invalida a lista de lojas no sucesso", async () => {
    merchantCreateStore.mockResolvedValueOnce(store);
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateStore(), { wrapper });
    result.current.mutate({ name: "Nova" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantCreateStore).toHaveBeenCalledWith({ name: "Nova" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["stores"] });
  });

  it("useUpdateStore chama o client com id e patch e invalida a lista", async () => {
    merchantUpdateStore.mockResolvedValueOnce(store);
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateStore("s1"), { wrapper });
    result.current.mutate({ active: false });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantUpdateStore).toHaveBeenCalledWith("s1", { active: false });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["stores"] });
  });

  it("useTogglePauseStore(true) chama pause e invalida a lista (story 57)", async () => {
    merchantPauseStore.mockResolvedValueOnce({ ...store, pausedAt: "2026-07-12T10:00:00.000Z" });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useTogglePauseStore("s1"), { wrapper });
    result.current.mutate(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantPauseStore).toHaveBeenCalledWith("s1");
    expect(merchantResumeStore).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith({ queryKey: ["stores"] });
  });

  it("useTogglePauseStore(false) chama resume (story 57)", async () => {
    merchantResumeStore.mockResolvedValueOnce({ ...store, pausedAt: null });
    const { result } = renderHook(() => useTogglePauseStore("s1"), { wrapper });
    result.current.mutate(false);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantResumeStore).toHaveBeenCalledWith("s1");
    expect(merchantPauseStore).not.toHaveBeenCalled();
  });
});
