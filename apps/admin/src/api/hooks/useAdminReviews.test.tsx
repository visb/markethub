import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminReviewDTO } from "@markethub/api-client";

const adminReviews = vi.fn();
const adminHideReview = vi.fn();
const adminUnhideReview = vi.fn();
let user: { id: string } | null = { id: "u1" };

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({
    api: { adminReviews, adminHideReview, adminUnhideReview },
    user,
  }),
}));

import { useAdminReviews, useHideReview, useUnhideReview } from "./useAdminReviews";

const reviewRow: AdminReviewDTO = {
  id: "r1",
  orderId: "o1",
  axis: "merchant",
  rating: 2,
  comment: "péssimo",
  authorName: "Ana Maria",
  createdAt: "2026-07-10T12:00:00.000Z",
  replyText: null,
  repliedAt: null,
  merchantId: "m1",
  merchantName: "Rede A",
  hidden: false,
  hiddenAt: null,
  hiddenReason: null,
  hiddenByName: null,
};

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useAdminReviews hooks (story 68)", () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    adminReviews.mockReset();
    adminHideReview.mockReset();
    adminUnhideReview.mockReset();
    user = { id: "u1" };
  });

  it("useAdminReviews busca a lista repassando os filtros", async () => {
    adminReviews.mockResolvedValueOnce([reviewRow]);
    const filter = { rating: 2, hidden: true, merchantId: "m1", q: "ruim" };
    const { result } = renderHook(() => useAdminReviews(filter), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([reviewRow]);
    expect(adminReviews).toHaveBeenCalledWith(filter);
  });

  it("useAdminReviews não busca sem usuário", () => {
    user = null;
    const { result } = renderHook(() => useAdminReviews(), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(adminReviews).not.toHaveBeenCalled();
  });

  it("useHideReview chama o client com id + motivo e invalida a lista", async () => {
    adminHideReview.mockResolvedValueOnce({ ...reviewRow, hidden: true });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useHideReview(), { wrapper });
    result.current.mutate({ id: "r1", reason: "spam" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adminHideReview).toHaveBeenCalledWith("r1", "spam");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["admin-reviews"] });
  });

  it("useUnhideReview repassa o id e invalida", async () => {
    adminUnhideReview.mockResolvedValueOnce(reviewRow);
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUnhideReview(), { wrapper });
    result.current.mutate("r1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adminUnhideReview).toHaveBeenCalledWith("r1");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["admin-reviews"] });
  });
});
