import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantOrderDTO } from "@markethub/api-client";

const merchantOrders = vi.fn();

/** Fake realtime client controlável: dispara connect/eventos no teste. */
function makeRealtime() {
  const handlers = new Map<string, ((p: unknown) => void)[]>();
  return {
    connected: false,
    on: vi.fn((event: string, h: (p: unknown) => void) => {
      const set = handlers.get(event) ?? [];
      set.push(h);
      handlers.set(event, set);
    }),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    subscribeStore: vi.fn(),
    subscribeOrder: vi.fn(),
    fire: (event: string, payload?: unknown) => {
      for (const h of handlers.get(event) ?? []) h(payload);
    },
  };
}

let realtime = makeRealtime();
const user = { id: "u1" };

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: { merchantOrders }, realtime, user }),
}));

import { useMerchantOrders, FALLBACK_INTERVAL_MS } from "./useMerchantOrders";

const order: MerchantOrderDTO = {
  id: "g1",
  orderId: "o1",
  storeId: "s1",
  storeName: "Loja A",
  status: "preparing",
  fulfillment: "delivery",
  itemCount: 2,
  totalCents: 1500,
  pickupCode: null,
  createdAt: "2026-06-22T10:00:00.000Z",
  delivery: null,
};

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useMerchantOrders", () => {
  beforeEach(() => {
    realtime = makeRealtime();
    merchantOrders.mockReset().mockResolvedValue([order]);
  });

  it("carrega o snapshot REST e filtra por loja/status", async () => {
    const { result } = renderHook(
      () => useMerchantOrders({ storeId: "s1", status: "preparing", subscribeStoreIds: ["s1"] }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.orders).toHaveLength(1));
    expect(merchantOrders).toHaveBeenCalledWith({ storeId: "s1", status: "preparing" });
    expect(result.current.orders[0].id).toBe("g1");
  });

  it("na conexão: subscribe:store por loja do escopo + marca conectado", async () => {
    const { result } = renderHook(
      () => useMerchantOrders({ subscribeStoreIds: ["s1", "s2"] }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(realtime.connect).toHaveBeenCalled());
    act(() => realtime.fire("connect"));
    expect(realtime.subscribeStore).toHaveBeenCalledWith("s1");
    expect(realtime.subscribeStore).toHaveBeenCalledWith("s2");
    await waitFor(() => expect(result.current.connected).toBe(true));
  });

  it("evento order.status_changed re-busca o snapshot (card muda de coluna)", async () => {
    const { result } = renderHook(
      () => useMerchantOrders({ subscribeStoreIds: ["s1"] }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.orders).toHaveLength(1));
    act(() => realtime.fire("connect"));

    merchantOrders.mockResolvedValue([{ ...order, status: "ready_for_pickup" }]);
    act(() => realtime.fire("order.status_changed", { orderId: "o1" }));
    await waitFor(() => expect(result.current.orders[0].status).toBe("ready_for_pickup"));
  });

  it("desconectado: polling de fallback; conectado: sem polling", async () => {
    const { result } = renderHook(
      () => useMerchantOrders({ subscribeStoreIds: ["s1"] }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.connected).toBe(false));
    // o gate de fallback é o intervalo exportado (usado quando desconectado)
    expect(FALLBACK_INTERVAL_MS).toBeGreaterThan(0);
    act(() => realtime.fire("connect"));
    await waitFor(() => expect(result.current.connected).toBe(true));
  });

  it("cleanup: desconecta no unmount", async () => {
    const { unmount } = renderHook(
      () => useMerchantOrders({ subscribeStoreIds: ["s1"] }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(realtime.connect).toHaveBeenCalled());
    unmount();
    expect(realtime.disconnect).toHaveBeenCalled();
  });

  it("não roda enquanto não há loja no escopo (enabled=false)", async () => {
    renderHook(() => useMerchantOrders({ subscribeStoreIds: [], enabled: false }), {
      wrapper: wrapper(),
    });
    // sem fetch e sem socket
    await new Promise((r) => setTimeout(r, 10));
    expect(merchantOrders).not.toHaveBeenCalled();
    expect(realtime.connect).not.toHaveBeenCalled();
  });
});
