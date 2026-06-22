import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantStaffDTO } from "@markethub/api-client";

const merchantStaff = vi.fn();
const merchantCreateStaff = vi.fn();
const merchantUpdateStaff = vi.fn();
const merchantRemoveStaff = vi.fn();
let user: { id: string } | null = { id: "u1" };

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({
    api: { merchantStaff, merchantCreateStaff, merchantUpdateStaff, merchantRemoveStaff },
    user,
  }),
}));

import {
  useCreateStaff,
  useRemoveStaff,
  useStaff,
  useUpdateStaff,
} from "./useStaff";

const staffRow: MerchantStaffDTO = {
  id: "st1",
  staffRole: "picker",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  store: { id: "s1", name: "Loja A" },
  user: { id: "u9", name: "Picker", email: "p@x.z", active: true },
};

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useStaff hooks (story 10)", () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    merchantStaff.mockReset();
    merchantCreateStaff.mockReset();
    merchantUpdateStaff.mockReset();
    merchantRemoveStaff.mockReset();
    user = { id: "u1" };
  });

  it("useStaff busca a lista (sem filtro de loja)", async () => {
    merchantStaff.mockResolvedValueOnce([staffRow]);
    const { result } = renderHook(() => useStaff(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([staffRow]);
    expect(merchantStaff).toHaveBeenCalledWith(undefined);
  });

  it("useStaff filtra por loja (passa storeId ao client)", async () => {
    merchantStaff.mockResolvedValueOnce([staffRow]);
    const { result } = renderHook(() => useStaff("s1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantStaff).toHaveBeenCalledWith("s1");
  });

  it("useStaff não busca sem usuário", () => {
    user = null;
    const { result } = renderHook(() => useStaff(), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(merchantStaff).not.toHaveBeenCalled();
  });

  it("useCreateStaff invalida a árvore de staff no sucesso", async () => {
    merchantCreateStaff.mockResolvedValueOnce({ id: "u9", email: "p@x.z", name: "Picker" });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateStaff(), { wrapper });
    const input = {
      name: "Picker",
      email: "p@x.z",
      password: "secret1",
      staffRole: "picker" as const,
      storeId: "s1",
    };
    result.current.mutate(input);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantCreateStaff).toHaveBeenCalledWith(input);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["staff"] });
  });

  it("useUpdateStaff chama o client com id e patch e invalida", async () => {
    merchantUpdateStaff.mockResolvedValueOnce({ id: "st1", staffRole: "picker", active: false });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateStaff(), { wrapper });
    result.current.mutate({ id: "st1", patch: { active: false } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantUpdateStaff).toHaveBeenCalledWith("st1", { active: false });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["staff"] });
  });

  it("useRemoveStaff repassa hard e invalida", async () => {
    merchantRemoveStaff.mockResolvedValueOnce({ id: "st1", removed: true });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useRemoveStaff(), { wrapper });
    result.current.mutate({ id: "st1", hard: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantRemoveStaff).toHaveBeenCalledWith("st1", true);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["staff"] });
  });
});
