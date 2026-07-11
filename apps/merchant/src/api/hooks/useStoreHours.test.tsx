import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const merchantStoreHours = vi.fn();
const merchantSetStoreHours = vi.fn();
const merchantStoreClosures = vi.fn();
const merchantAddStoreClosure = vi.fn();
const merchantRemoveStoreClosure = vi.fn();
let user: { id: string } | null = { id: "u1" };

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({
    api: {
      merchantStoreHours,
      merchantSetStoreHours,
      merchantStoreClosures,
      merchantAddStoreClosure,
      merchantRemoveStoreClosure,
    },
    user,
  }),
}));

import {
  useAddStoreClosure,
  useRemoveStoreClosure,
  useSetStoreHours,
  useStoreClosures,
  useStoreHours,
} from "./useStoreHours";

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useStoreHours hooks (story 52)", () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    merchantStoreHours.mockReset();
    merchantSetStoreHours.mockReset();
    merchantStoreClosures.mockReset();
    merchantAddStoreClosure.mockReset();
    merchantRemoveStoreClosure.mockReset();
    user = { id: "u1" };
  });

  it("useStoreHours busca o horário da loja", async () => {
    merchantStoreHours.mockResolvedValueOnce([{ id: "h1", dayOfWeek: 1, opensAt: 480, closesAt: 1320 }]);
    const { result } = renderHook(() => useStoreHours("s1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantStoreHours).toHaveBeenCalledWith("s1");
  });

  it("useStoreHours não busca sem usuário", () => {
    user = null;
    const { result } = renderHook(() => useStoreHours("s1"), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(merchantStoreHours).not.toHaveBeenCalled();
  });

  it("useSetStoreHours envia as faixas e invalida a query de horário", async () => {
    merchantSetStoreHours.mockResolvedValueOnce([]);
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSetStoreHours("s1"), { wrapper });
    result.current.mutate([{ dayOfWeek: 1, opensAt: 480, closesAt: 1320 }]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantSetStoreHours).toHaveBeenCalledWith("s1", [{ dayOfWeek: 1, opensAt: 480, closesAt: 1320 }]);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["store-hours", "hours", "s1"] });
  });

  it("useStoreClosures busca os fechamentos", async () => {
    merchantStoreClosures.mockResolvedValueOnce([{ id: "c1", date: "2026-12-25", reason: "Natal" }]);
    const { result } = renderHook(() => useStoreClosures("s1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantStoreClosures).toHaveBeenCalledWith("s1");
  });

  it("useAddStoreClosure cria e invalida a query de fechamentos", async () => {
    merchantAddStoreClosure.mockResolvedValueOnce({ id: "c1", date: "2026-12-25", reason: null });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useAddStoreClosure("s1"), { wrapper });
    result.current.mutate({ date: "2026-12-25", reason: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantAddStoreClosure).toHaveBeenCalledWith("s1", { date: "2026-12-25", reason: null });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["store-hours", "closures", "s1"] });
  });

  it("useRemoveStoreClosure remove e invalida a query de fechamentos", async () => {
    merchantRemoveStoreClosure.mockResolvedValueOnce({ removed: true });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useRemoveStoreClosure("s1"), { wrapper });
    result.current.mutate("c1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantRemoveStoreClosure).toHaveBeenCalledWith("s1", "c1");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["store-hours", "closures", "s1"] });
  });
});
