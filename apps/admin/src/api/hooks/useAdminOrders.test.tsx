import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/queryKeys";

const request = vi.fn();
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: { request } }),
}));

import {
  useAdminOrder,
  useAdminOrders,
  useAdminOrderTimeline,
  useCancelAdminOrder,
  useManualRefund,
} from "./useAdminOrders";

/**
 * Server-state dos pedidos no admin (story 67): lista com busca, detalhe,
 * timeline e mutations de suporte que invalidam o recurso inteiro.
 */

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useAdminOrders (story 67)", () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    request.mockReset();
  });

  it("lista com filtros (status, q, page) na query string", async () => {
    request.mockResolvedValueOnce({ items: [], total: 0, page: 2, pageSize: 20, statusCounts: {} });
    const { result } = renderHook(
      () => useAdminOrders({ status: "paid", q: "ana", page: 2 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(request).toHaveBeenCalledWith(
      "/admin/dashboard/orders?page=2&pageSize=20&status=paid&q=ana",
      { auth: true },
    );
  });

  it("detalhe e timeline buscam por id; id vazio não busca", async () => {
    request.mockResolvedValue([]);
    const detail = renderHook(() => useAdminOrder("o1"), { wrapper });
    const timeline = renderHook(() => useAdminOrderTimeline("o1"), { wrapper });
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(timeline.result.current.isSuccess).toBe(true));
    expect(request).toHaveBeenCalledWith("/admin/dashboard/orders/o1", { auth: true });
    expect(request).toHaveBeenCalledWith("/admin/dashboard/orders/o1/timeline", { auth: true });

    const idle = renderHook(() => useAdminOrder(""), { wrapper });
    expect(idle.result.current.fetchStatus).toBe("idle");
  });

  it("cancelar posta o motivo e invalida as queries de pedidos", async () => {
    request.mockResolvedValue({ id: "o1", status: "canceled" });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCancelAdminOrder("o1"), { wrapper });

    await result.current.mutateAsync({ reason: "cliente pediu" });

    expect(request).toHaveBeenCalledWith("/admin/dashboard/orders/o1/cancel", {
      method: "POST",
      auth: true,
      body: { reason: "cliente pediu" },
    });
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.adminOrders.all }),
    );
  });

  it("cancelar sem motivo manda body vazio", async () => {
    request.mockResolvedValue({ id: "o1", status: "canceled" });
    const { result } = renderHook(() => useCancelAdminOrder("o1"), { wrapper });
    await result.current.mutateAsync({});
    expect(request).toHaveBeenCalledWith(
      "/admin/dashboard/orders/o1/cancel",
      expect.objectContaining({ body: {} }),
    );
  });

  it("reembolso manual posta grupo/valor/nota e invalida as queries", async () => {
    request.mockResolvedValue({ componentId: "c1", status: "requested" });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useManualRefund("o1"), { wrapper });

    await result.current.mutateAsync({ orderGroupId: "g1", amountCents: 2500, note: "ok" });

    expect(request).toHaveBeenCalledWith("/admin/dashboard/orders/o1/refund", {
      method: "POST",
      auth: true,
      body: { orderGroupId: "g1", amountCents: 2500, note: "ok" },
    });
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.adminOrders.all }),
    );
  });

  it("reembolso sem nota omite o campo", async () => {
    request.mockResolvedValue({ componentId: "c1", status: "requested" });
    const { result } = renderHook(() => useManualRefund("o1"), { wrapper });
    await result.current.mutateAsync({ orderGroupId: "g1", amountCents: 100 });
    expect(request).toHaveBeenCalledWith(
      "/admin/dashboard/orders/o1/refund",
      expect.objectContaining({ body: { orderGroupId: "g1", amountCents: 100 } }),
    );
  });
});
