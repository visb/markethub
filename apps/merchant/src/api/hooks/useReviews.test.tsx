import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantReviewDTO } from "@markethub/api-client";

const merchantReviews = vi.fn();
const merchantReplyReview = vi.fn();
let user: { id: string } | null = { id: "u1" };

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: { merchantReviews, merchantReplyReview }, user }),
}));

import { useReplyReview, useReviews } from "./useReviews";

const reviewRow: MerchantReviewDTO = {
  id: "r1",
  rating: 5,
  comment: "top",
  authorName: "Ana",
  createdAt: "2026-07-10T00:00:00.000Z",
  replyText: null,
  repliedAt: null,
  merchantId: "m1",
};

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useReviews hooks (story 56)", () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    merchantReviews.mockReset();
    merchantReplyReview.mockReset();
    user = { id: "u1" };
  });

  it("useReviews busca a lista repassando os filtros", async () => {
    merchantReviews.mockResolvedValueOnce([reviewRow]);
    const { result } = renderHook(() => useReviews({ rating: 5, unanswered: true }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([reviewRow]);
    expect(merchantReviews).toHaveBeenCalledWith({ rating: 5, unanswered: true });
  });

  it("useReviews não busca sem usuário", () => {
    user = null;
    const { result } = renderHook(() => useReviews(), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(merchantReviews).not.toHaveBeenCalled();
  });

  it("useReplyReview chama o client e invalida a árvore de avaliações", async () => {
    merchantReplyReview.mockResolvedValueOnce({ ...reviewRow, replyText: "ok" });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useReplyReview(), { wrapper });
    result.current.mutate({ id: "r1", text: "ok" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantReplyReview).toHaveBeenCalledWith("r1", "ok");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["reviews"] });
  });
});
