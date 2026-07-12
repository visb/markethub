import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const merchantOrderGroup = vi.fn();
const merchantCancelOrderGroup = vi.fn();
const storeDeliveryRetry = vi.fn();

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: { merchantOrderGroup, merchantCancelOrderGroup, storeDeliveryRetry } }),
}));

import {
  useCancelOrderGroup,
  useMerchantOrderDetail,
  useRetryDelivery,
} from "./useMerchantOrderDetail";
import { queryKeys } from "@/lib/queryKeys";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const Provider = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { Provider, invalidate };
}

beforeEach(() => {
  merchantOrderGroup.mockReset().mockResolvedValue({ id: "g1" });
  merchantCancelOrderGroup.mockReset().mockResolvedValue({ id: "g1", status: "canceled" });
  storeDeliveryRetry.mockReset().mockResolvedValue({ id: "d1", status: "unassigned" });
});

describe("useMerchantOrderDetail", () => {
  it("busca o detalhe só quando há groupId", async () => {
    const { Provider } = wrapper();
    const { result } = renderHook(() => useMerchantOrderDetail("g1"), { wrapper: Provider });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantOrderGroup).toHaveBeenCalledWith("g1");
  });

  it("não busca com groupId null", async () => {
    const { Provider } = wrapper();
    const { result } = renderHook(() => useMerchantOrderDetail(null), { wrapper: Provider });
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(merchantOrderGroup).not.toHaveBeenCalled();
  });
});

describe("useCancelOrderGroup", () => {
  it("cancela e invalida lista + detalhe", async () => {
    const { Provider, invalidate } = wrapper();
    const { result } = renderHook(() => useCancelOrderGroup("g1"), { wrapper: Provider });
    await act(async () => {
      await result.current.mutateAsync("sem estoque");
    });
    expect(merchantCancelOrderGroup).toHaveBeenCalledWith("g1", "sem estoque");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.orders.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.orders.detail("g1") });
  });
});

describe("useRetryDelivery (story 61)", () => {
  it("reenvia a entrega e invalida lista + detalhe", async () => {
    const { Provider, invalidate } = wrapper();
    const { result } = renderHook(() => useRetryDelivery("g1"), { wrapper: Provider });
    await act(async () => {
      await result.current.mutateAsync("d1");
    });
    expect(storeDeliveryRetry).toHaveBeenCalledWith("d1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.orders.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.orders.detail("g1") });
  });

  it("groupId null: invalida só a lista", async () => {
    const { Provider, invalidate } = wrapper();
    const { result } = renderHook(() => useRetryDelivery(null), { wrapper: Provider });
    await act(async () => {
      await result.current.mutateAsync("d1");
    });
    expect(storeDeliveryRetry).toHaveBeenCalledWith("d1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.orders.all });
  });
});
