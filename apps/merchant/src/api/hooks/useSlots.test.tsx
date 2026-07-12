import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const merchantStoreSlots = vi.fn();
const merchantCreateSlot = vi.fn();
const merchantDeleteSlot = vi.fn();
let user: { id: string } | null = { id: "u1" };

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({
    api: { merchantStoreSlots, merchantCreateSlot, merchantDeleteSlot },
    user,
  }),
}));

import { useCreateSlot, useDeleteSlot, useStoreSlots } from "./useSlots";

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useSlots hooks (story 55)", () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    merchantStoreSlots.mockReset();
    merchantCreateSlot.mockReset();
    merchantDeleteSlot.mockReset();
    user = { id: "u1" };
  });

  it("useStoreSlots busca os slots da loja", async () => {
    merchantStoreSlots.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useStoreSlots("s1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantStoreSlots).toHaveBeenCalledWith("s1");
  });

  it("useStoreSlots não busca sem loja", () => {
    const { result } = renderHook(() => useStoreSlots(""), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(merchantStoreSlots).not.toHaveBeenCalled();
  });

  it("useStoreSlots não busca sem usuário", () => {
    user = null;
    const { result } = renderHook(() => useStoreSlots("s1"), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(merchantStoreSlots).not.toHaveBeenCalled();
  });

  it("useCreateSlot cria e invalida a query de slots da loja", async () => {
    merchantCreateSlot.mockResolvedValueOnce({ id: "sl1" });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateSlot("s1"), { wrapper });
    result.current.mutate({
      storeId: "s1",
      start: "2026-07-01T11:00:00.000Z",
      end: "2026-07-01T12:00:00.000Z",
      capacity: 5,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantCreateSlot).toHaveBeenCalledWith({
      storeId: "s1",
      start: "2026-07-01T11:00:00.000Z",
      end: "2026-07-01T12:00:00.000Z",
      capacity: 5,
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["slots", "s1"] });
  });

  it("useDeleteSlot remove e invalida a query de slots da loja", async () => {
    merchantDeleteSlot.mockResolvedValueOnce({ removed: true });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteSlot("s1"), { wrapper });
    result.current.mutate("sl1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantDeleteSlot).toHaveBeenCalledWith("sl1");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["slots", "s1"] });
  });
});
