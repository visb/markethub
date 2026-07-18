import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTip } from "../api/hooks/useTip";
import { queryKeys } from "../lib/queryKeys";

/**
 * Story 77 — hook de gorjeta individual por alvo. Query dos alvos + do Tip (404
 * vira null), mutation de criar (cacheia o Tip) e de pagar (invalida). ApiClient
 * falso via useAuth; espelha useAvailableCoupons.test.tsx.
 */

const mockRequest = jest.fn();
jest.mock("@/auth-context", () => ({
  useAuth: () => ({ api: { request: (...a: unknown[]) => mockRequest(...a) } }),
}));

function renderHook<T>(useHook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const result: { current: T | null } = { current: null };
  function Probe() {
    result.current = useHook();
    return null;
  }
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  return { result, client, unmount: () => { act(() => tree!.unmount()); client.clear(); } };
}

async function waitFor(predicate: () => boolean, tries = 50) {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
  if (!predicate()) throw new Error("waitFor: condição não satisfeita");
}

const TARGETS = { orderId: "o1", hasDelivery: true, driverName: "Carlos", merchants: [] };

beforeEach(() => {
  mockRequest.mockReset();
});

describe("useTip (story 77)", () => {
  it("carrega os alvos e trata 404 do Tip como null", async () => {
    mockRequest.mockImplementation((path: string) => {
      if (path === "/orders/o1/tip/targets") return Promise.resolve(TARGETS);
      return Promise.reject(new Error("TIP_NOT_FOUND"));
    });
    const { result, unmount } = renderHook(() => useTip("o1"));
    await waitFor(() => result.current!.targets !== null);
    expect(result.current!.targets).toEqual(TARGETS);
    expect(result.current!.tip).toBeNull();
    unmount();
  });

  it("createTip faz POST com os itens e cacheia o Tip retornado", async () => {
    const tip = { id: "t1", orderId: "o1", amountCents: 500, status: "pending", items: [] };
    mockRequest.mockImplementation((path: string, opts?: { method?: string }) => {
      if (path === "/orders/o1/tip/targets") return Promise.resolve(TARGETS);
      if (path === "/orders/o1/tip" && opts?.method === "POST") return Promise.resolve(tip);
      return Promise.reject(new Error("TIP_NOT_FOUND"));
    });
    const { result, client, unmount } = renderHook(() => useTip("o1"));
    await waitFor(() => result.current!.targets !== null);
    const items = [{ target: "platform" as const, amountCents: 500 }];
    await act(async () => {
      await result.current!.createTip(items);
    });
    expect(mockRequest).toHaveBeenCalledWith("/orders/o1/tip", {
      method: "POST",
      auth: true,
      body: { items },
    });
    expect(client.getQueryData(queryKeys.tip.view("o1"))).toEqual(tip);
    unmount();
  });

  it("payTip faz POST mock-pay e invalida o Tip", async () => {
    mockRequest.mockImplementation((path: string) => {
      if (path === "/orders/o1/tip/targets") return Promise.resolve(TARGETS);
      if (path === "/orders/o1/tip/mock-pay") return Promise.resolve({ handled: true });
      return Promise.reject(new Error("TIP_NOT_FOUND"));
    });
    const { result, client, unmount } = renderHook(() => useTip("o1"));
    await waitFor(() => result.current!.targets !== null);
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await act(async () => {
      await result.current!.payTip();
    });
    expect(mockRequest).toHaveBeenCalledWith("/orders/o1/tip/mock-pay", { method: "POST", auth: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.tip.view("o1") });
    unmount();
  });
});
