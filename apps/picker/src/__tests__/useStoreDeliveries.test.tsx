import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient } from "@markethub/api-client";
import {
  useDeliveryActions,
  useStoreDeliveries,
  useStoreDrivers,
} from "../api/hooks/useStoreDeliveries";
import { queryKeys } from "../lib/queryKeys";

/**
 * Story 61: hooks do despacho de entregas do picker (React Query). Mocka o módulo
 * `@/api/deliveries` + auth-context. Verifica query keys/escopo, `enabled`, e que
 * as ações (atribuir/desatribuir/reenviar/cancelar) invalidam a fila da loja.
 */

const mockQueue = jest.fn();
const mockDrivers = jest.fn();
const mockAssign = jest.fn();
const mockUnassign = jest.fn();
const mockRetry = jest.fn();
const mockCancel = jest.fn();

const fakeClient = {} as ApiClient;

jest.mock("../api/deliveries", () => ({
  storeDeliveries: () => ({
    queue: (...a: unknown[]) => mockQueue(...a),
    drivers: (...a: unknown[]) => mockDrivers(...a),
    assign: (...a: unknown[]) => mockAssign(...a),
    unassign: (...a: unknown[]) => mockUnassign(...a),
    retry: (...a: unknown[]) => mockRetry(...a),
    cancelGroup: (...a: unknown[]) => mockCancel(...a),
  }),
}));

jest.mock("@/auth-context", () => ({
  useAuth: () => ({ client: fakeClient }),
}));

let activeClient: QueryClient | null = null;

function renderHook<T>(useHook: () => T, client?: QueryClient) {
  const qc = client ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  activeClient = qc;
  const result: { current: T | null } = { current: null };
  function Probe() {
    result.current = useHook();
    return null;
  }
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={qc}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  return { result, client: qc, unmount: () => act(() => tree!.unmount()) };
}

async function waitFor(predicate: () => boolean, tries = 50) {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  if (!predicate()) throw new Error("waitFor: condição não satisfeita");
}

beforeEach(() => {
  mockQueue.mockReset().mockResolvedValue([{ id: "d1", status: "failed" }]);
  mockDrivers.mockReset().mockResolvedValue([{ id: "drv1", name: "Ent", activeDeliveries: 0 }]);
  mockAssign.mockReset().mockResolvedValue({ id: "d1" });
  mockUnassign.mockReset().mockResolvedValue({ id: "d1" });
  mockRetry.mockReset().mockResolvedValue({ id: "d1", status: "unassigned" });
  mockCancel.mockReset().mockResolvedValue({ id: "g1", status: "canceled" });
});

afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("queryKeys.deliveries", () => {
  it("compõe chaves não-literais por loja", () => {
    expect(queryKeys.deliveries.queue("s1")).toEqual(["deliveries", "queue", "s1"]);
    expect(queryKeys.deliveries.drivers("s1")).toEqual(["deliveries", "drivers", "s1"]);
  });
});

describe("useStoreDeliveries / useStoreDrivers", () => {
  it("busca a fila da loja", async () => {
    const { result, unmount } = renderHook(() => useStoreDeliveries("s1"));
    await waitFor(() => result.current?.isSuccess === true);
    expect(mockQueue).toHaveBeenCalledWith("s1");
    expect(result.current?.data?.[0]?.status).toBe("failed");
    unmount();
  });

  it("não busca sem storeId (null)", async () => {
    const { result, unmount } = renderHook(() => useStoreDeliveries(null));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mockQueue).not.toHaveBeenCalled();
    expect(result.current?.fetchStatus).toBe("idle");
    unmount();
  });

  it("busca os entregadores da loja", async () => {
    const { result, unmount } = renderHook(() => useStoreDrivers("s1"));
    await waitFor(() => result.current?.isSuccess === true);
    expect(mockDrivers).toHaveBeenCalledWith("s1");
    unmount();
  });
});

describe("useDeliveryActions (story 61)", () => {
  function setupSpy() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.fn();
    const realInvalidate = client.invalidateQueries.bind(client);
    jest.spyOn(client, "invalidateQueries").mockImplementation((args) => {
      invalidateSpy(args);
      return realInvalidate(args);
    });
    return { client, invalidateSpy };
  }

  it("retry reenvia e invalida a fila da loja", async () => {
    const { client, invalidateSpy } = setupSpy();
    const { result, unmount } = renderHook(() => useDeliveryActions("s1"), client);
    await act(async () => {
      await result.current!.retry.mutateAsync("d1");
    });
    expect(mockRetry).toHaveBeenCalledWith("d1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.deliveries.queue("s1") });
    unmount();
  });

  it("cancel cancela o sub-pedido e invalida a fila", async () => {
    const { client, invalidateSpy } = setupSpy();
    const { result, unmount } = renderHook(() => useDeliveryActions("s1"), client);
    await act(async () => {
      await result.current!.cancel.mutateAsync("g1");
    });
    expect(mockCancel).toHaveBeenCalledWith("g1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.deliveries.queue("s1") });
    unmount();
  });

  it("assign atribui um entregador à entrega", async () => {
    const { result, unmount } = renderHook(() => useDeliveryActions("s1"));
    await act(async () => {
      await result.current!.assign.mutateAsync({ id: "d1", driverId: "drv1" });
    });
    expect(mockAssign).toHaveBeenCalledWith("d1", "drv1");
    unmount();
  });

  it("unassign desfaz a atribuição", async () => {
    const { result, unmount } = renderHook(() => useDeliveryActions("s1"));
    await act(async () => {
      await result.current!.unassign.mutateAsync("d1");
    });
    expect(mockUnassign).toHaveBeenCalledWith("d1");
    unmount();
  });

  it("storeId null não quebra a invalidação (no-op)", async () => {
    const { result, unmount } = renderHook(() => useDeliveryActions(null));
    await act(async () => {
      await result.current!.retry.mutateAsync("d1");
    });
    expect(mockRetry).toHaveBeenCalledWith("d1");
    unmount();
  });
});
