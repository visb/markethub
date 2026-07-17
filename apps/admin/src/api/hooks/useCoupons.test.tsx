import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CouponDTO } from "@markethub/api-client";

const adminCoupons = vi.fn();
const adminCreateCoupon = vi.fn();
const adminUpdateCoupon = vi.fn();
const adminRemoveCoupon = vi.fn();
let user: { id: string } | null = { id: "u1" };

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({
    api: { adminCoupons, adminCreateCoupon, adminUpdateCoupon, adminRemoveCoupon },
    user,
  }),
}));

import { useCoupons, useCreateCoupon, useDeleteCoupon, useUpdateCoupon } from "./useCoupons";

const couponRow: CouponDTO = {
  id: "c1",
  code: "GLOBAL10",
  title: "Global 10%",
  description: null,
  type: "percent",
  value: 10,
  merchantId: null,
  merchantName: null,
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

describe("useCoupons hooks admin (story 53)", () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    adminCoupons.mockReset();
    adminCreateCoupon.mockReset();
    adminUpdateCoupon.mockReset();
    adminRemoveCoupon.mockReset();
    user = { id: "u1" };
  });

  it("useCoupons busca a lista com o filtro", async () => {
    adminCoupons.mockResolvedValueOnce([couponRow]);
    const { result } = renderHook(() => useCoupons("global"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([couponRow]);
    expect(adminCoupons).toHaveBeenCalledWith("global");
  });

  it("useCoupons não busca sem usuário", () => {
    user = null;
    const { result } = renderHook(() => useCoupons(), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(adminCoupons).not.toHaveBeenCalled();
  });

  it("useCreateCoupon chama o client e invalida", async () => {
    adminCreateCoupon.mockResolvedValueOnce(couponRow);
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateCoupon(), { wrapper });
    const input = { code: "GLOBAL10", title: "Global 10%", type: "percent" as const, value: 10, merchantId: null };
    result.current.mutate(input);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adminCreateCoupon).toHaveBeenCalledWith(input);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["coupons"] });
  });

  it("useUpdateCoupon chama o client com id e patch e invalida", async () => {
    adminUpdateCoupon.mockResolvedValueOnce({ ...couponRow, active: false });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateCoupon(), { wrapper });
    result.current.mutate({ id: "c1", patch: { active: false } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adminUpdateCoupon).toHaveBeenCalledWith("c1", { active: false });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["coupons"] });
  });

  it("useDeleteCoupon repassa o id e invalida", async () => {
    adminRemoveCoupon.mockResolvedValueOnce({ id: "c1", removed: true });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteCoupon(), { wrapper });
    result.current.mutate("c1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adminRemoveCoupon).toHaveBeenCalledWith("c1");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["coupons"] });
  });
});
