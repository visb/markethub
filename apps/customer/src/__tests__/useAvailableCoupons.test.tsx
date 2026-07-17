import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useApplyCoupon,
  useAvailableCoupons,
  useRemoveCoupon,
} from "../api/hooks/useAvailableCoupons";
import { queryKeys } from "../lib/queryKeys";

/**
 * Story 74: hooks de cupons disponíveis — query central (GET /cart/coupons) +
 * mutations de aplicar/remover que invalidam a lista. ApiClient falso via
 * useAuth; espelha useAddresses.test.tsx.
 */

const mockRequest = jest.fn();
jest.mock("@/auth-context", () => ({
  useAuth: () => ({ api: { request: (...a: unknown[]) => mockRequest(...a) } }),
}));

let activeClient: QueryClient | null = null;

function renderHook<T>(useHook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  activeClient = client;
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

beforeEach(() => {
  mockRequest.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("useAvailableCoupons (query)", () => {
  it("busca GET /cart/coupons na key central e expõe a lista", async () => {
    const coupons = [
      { code: "OFF10", title: "Dez", description: null, type: "percent", value: 10, merchantId: null, minOrderCents: null, discountCents: 200, applicable: true, reason: null },
    ];
    mockRequest.mockResolvedValue(coupons);
    const { result, client, unmount } = renderHook(() => useAvailableCoupons());
    await waitFor(() => result.current!.coupons.length === 1);
    expect(mockRequest).toHaveBeenCalledWith("/cart/coupons", { auth: true });
    expect(client.getQueryData(queryKeys.cart.availableCoupons)).toEqual(coupons);
    expect(result.current!.loading).toBe(false);
    unmount();
  });
});

describe("mutations de cupom (story 74)", () => {
  it("useApplyCoupon: POST /cart/coupon e invalida os disponíveis", async () => {
    const { result, client, unmount } = renderHook(() => useApplyCoupon());
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await act(async () => {
      await result.current!.mutateAsync("OFF10");
    });
    expect(mockRequest).toHaveBeenCalledWith("/cart/coupon", {
      method: "POST",
      auth: true,
      body: { code: "OFF10" },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.cart.availableCoupons });
    unmount();
  });

  it("useRemoveCoupon: DELETE /cart/coupon e invalida os disponíveis", async () => {
    const { result, client, unmount } = renderHook(() => useRemoveCoupon());
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await act(async () => {
      await result.current!.mutateAsync();
    });
    expect(mockRequest).toHaveBeenCalledWith("/cart/coupon", { method: "DELETE", auth: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.cart.availableCoupons });
    unmount();
  });

  it("erro na aplicação não invalida a lista", async () => {
    mockRequest.mockRejectedValueOnce(new Error("boom"));
    const { result, client, unmount } = renderHook(() => useApplyCoupon());
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await act(async () => {
      await result.current!.mutateAsync("X").catch(() => undefined);
    });
    expect(invalidate).not.toHaveBeenCalled();
    unmount();
  });
});
