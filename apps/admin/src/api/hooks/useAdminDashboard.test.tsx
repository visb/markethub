import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminDashboardSummary } from "@/api/dashboard";

const request = vi.fn();
let user: { id: string; roles: string[] } | null = { id: "u1", roles: ["admin"] };

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: { request }, user }),
}));

import { useAdminDashboard } from "./useAdminDashboard";

const summary: AdminDashboardSummary = {
  kpis: {
    ordersPaidToday: 12,
    ordersPaidDeltaPct: 20,
    gmvTodayCents: 60000,
    gmvDeltaPct: 50,
    avgTicketCents: 5000,
    activeStores: 7,
    pausedStores: 1,
  },
  queues: {
    pickingQueuedOver15Min: 3,
    deliveriesUnassignedOver15Min: 2,
    pickupsAwaiting: 4,
    deliveriesFailedAwaitingDecision: 1,
  },
  alerts: [],
};

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useAdminDashboard (story 66)", () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    request.mockReset();
    user = { id: "u1", roles: ["admin"] };
  });

  it("busca o agregador autenticado numa chamada só", async () => {
    request.mockResolvedValueOnce(summary);
    const { result } = renderHook(() => useAdminDashboard(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(summary);
    expect(request).toHaveBeenCalledWith("/admin/dashboard", { auth: true });
  });

  it("não busca para usuário sem papel admin", () => {
    user = { id: "u2", roles: ["merchant"] };
    const { result } = renderHook(() => useAdminDashboard(), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(request).not.toHaveBeenCalled();
  });

  it("não busca sem usuário logado", () => {
    user = null;
    const { result } = renderHook(() => useAdminDashboard(), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(request).not.toHaveBeenCalled();
  });
});
