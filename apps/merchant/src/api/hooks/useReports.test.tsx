import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const merchantSalesReport = vi.fn();
const merchantOperationsReport = vi.fn();
const merchantTopProductsReport = vi.fn();
const merchantReviewsReport = vi.fn();
const merchantPickersReport = vi.fn();
let user: { id: string } | null = { id: "u1" };

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({
    api: {
      merchantSalesReport,
      merchantOperationsReport,
      merchantTopProductsReport,
      merchantReviewsReport,
      merchantPickersReport,
    },
    user,
  }),
}));

import {
  useOperationsReport,
  usePickersReport,
  useReviewsReport,
  useSalesReport,
  useTopProductsReport,
} from "./useReports";

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useReports hooks (story 13)", () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    merchantSalesReport.mockReset();
    merchantOperationsReport.mockReset();
    merchantTopProductsReport.mockReset();
    merchantReviewsReport.mockReset();
    merchantPickersReport.mockReset();
    user = { id: "u1" };
  });

  it("useSalesReport repassa os filtros ao client", async () => {
    merchantSalesReport.mockResolvedValueOnce({ ordersPaid: 0 });
    const filters = { from: "a", to: "b", storeId: "s1" };
    const { result } = renderHook(() => useSalesReport(filters), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantSalesReport).toHaveBeenCalledWith(filters);
  });

  it("filtros diferentes geram buscas diferentes (query key)", async () => {
    merchantSalesReport.mockResolvedValue({ ordersPaid: 1 });
    const { rerender } = renderHook((f: { from?: string }) => useSalesReport(f), {
      wrapper,
      initialProps: { from: "x" },
    });
    await waitFor(() => expect(merchantSalesReport).toHaveBeenCalledTimes(1));
    rerender({ from: "y" });
    await waitFor(() => expect(merchantSalesReport).toHaveBeenCalledTimes(2));
  });

  it("operations/topProducts/reviews chamam o client correspondente", async () => {
    merchantOperationsReport.mockResolvedValueOnce({ ordersByStatus: {} });
    merchantTopProductsReport.mockResolvedValueOnce({ items: [] });
    merchantReviewsReport.mockResolvedValueOnce({ axes: [] });
    const f = { storeId: "s1" };
    const ops = renderHook(() => useOperationsReport(f), { wrapper });
    const top = renderHook(() => useTopProductsReport(f), { wrapper });
    const rev = renderHook(() => useReviewsReport(f), { wrapper });
    await waitFor(() => expect(ops.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(top.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(rev.result.current.isSuccess).toBe(true));
    expect(merchantOperationsReport).toHaveBeenCalledWith(f);
    expect(merchantTopProductsReport).toHaveBeenCalledWith(f);
    expect(merchantReviewsReport).toHaveBeenCalledWith(f);
  });

  it("usePickersReport repassa os filtros ao client (story 65)", async () => {
    merchantPickersReport.mockResolvedValueOnce({ rows: [] });
    const filters = { from: "a", to: "b", storeId: "s1" };
    const { result } = renderHook(() => usePickersReport(filters), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantPickersReport).toHaveBeenCalledWith(filters);
  });

  it("usePickersReport não busca quando enabled=false", () => {
    const { result } = renderHook(() => usePickersReport({}, { enabled: false }), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(merchantPickersReport).not.toHaveBeenCalled();
  });

  it("não busca sem usuário", () => {
    user = null;
    const { result } = renderHook(() => useSalesReport({}), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(merchantSalesReport).not.toHaveBeenCalled();
  });

  it("não busca quando enabled=false", () => {
    const { result } = renderHook(() => useSalesReport({}, { enabled: false }), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(merchantSalesReport).not.toHaveBeenCalled();
  });
});
