import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CouponDTO } from "@markethub/api-client";

const merchantCoupons = vi.fn();
const merchantCreateCoupon = vi.fn();
const merchantUpdateCoupon = vi.fn();
const merchantRemoveCoupon = vi.fn();
let user: { id: string } | null = { id: "u1" };

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({
    api: { merchantCoupons, merchantCreateCoupon, merchantUpdateCoupon, merchantRemoveCoupon },
    user,
  }),
}));

import { useCoupons, useCreateCoupon, useDeleteCoupon, useUpdateCoupon } from "./useCoupons";

const couponRow: CouponDTO = {
  id: "c1",
  code: "BLACK10",
  title: "Black 10%",
  description: null,
  type: "percent",
  value: 10,
  merchantId: "m1",
  merchantName: "Rede A",
  minOrderCents: null,
  validFrom: null,
  validTo: null,
  maxUses: null,
  usedCount: 0,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useCoupons hooks (story 53)", () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    merchantCoupons.mockReset();
    merchantCreateCoupon.mockReset();
    merchantUpdateCoupon.mockReset();
    merchantRemoveCoupon.mockReset();
    user = { id: "u1" };
  });

  it("useCoupons busca a lista (sem filtro de rede)", async () => {
    merchantCoupons.mockResolvedValueOnce([couponRow]);
    const { result } = renderHook(() => useCoupons(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([couponRow]);
    expect(merchantCoupons).toHaveBeenCalledWith(undefined);
  });

  it("useCoupons não busca sem usuário", () => {
    user = null;
    const { result } = renderHook(() => useCoupons(), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(merchantCoupons).not.toHaveBeenCalled();
  });

  it("useCreateCoupon chama o client e invalida a árvore de cupons", async () => {
    merchantCreateCoupon.mockResolvedValueOnce(couponRow);
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateCoupon(), { wrapper });
    const input = { code: "BLACK10", title: "Black 10%", type: "percent" as const, value: 10 };
    result.current.mutate(input);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantCreateCoupon).toHaveBeenCalledWith(input);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["coupons"] });
  });

  it("useUpdateCoupon chama o client com id e patch e invalida", async () => {
    merchantUpdateCoupon.mockResolvedValueOnce({ ...couponRow, active: false });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateCoupon(), { wrapper });
    result.current.mutate({ id: "c1", patch: { active: false } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantUpdateCoupon).toHaveBeenCalledWith("c1", { active: false });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["coupons"] });
  });

  it("useDeleteCoupon repassa o id e invalida", async () => {
    merchantRemoveCoupon.mockResolvedValueOnce({ id: "c1", removed: true });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteCoupon(), { wrapper });
    result.current.mutate("c1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantRemoveCoupon).toHaveBeenCalledWith("c1");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["coupons"] });
  });
});
