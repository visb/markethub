import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient, DeliveryDTO } from "@markethub/api-client";
import {
  useAcceptDelivery,
  useAvailableDeliveries,
  useConfirmDelivery,
  useConfirmPickup,
  useDeliveryDetail,
  useDriverDeliveries,
  useDriverStores,
  useFailDelivery,
} from "../api/hooks/useDriverDeliveries";
import { queryKeys } from "../lib/queryKeys";

/**
 * Story 41: hooks de dados das entregas (migração do fetch legado da home/detalhe
 * para React Query). Mocka o módulo `@/api/deliveries` e o auth-context (client
 * fake). Verifica query keys, escopo de loja, `enabled`, invalidação e cache do
 * detalhe atualizado pelas mutations de coleta/entrega.
 */

const mockStores = jest.fn();
const mockMine = jest.fn();
const mockAvailable = jest.fn();
const mockAccept = jest.fn();
const mockConfirmPickup = jest.fn();
const mockConfirmDelivery = jest.fn();
const mockFail = jest.fn();

const fakeClient = {} as ApiClient;

jest.mock("../api/deliveries", () => ({
  deliveries: () => ({
    stores: (...a: unknown[]) => mockStores(...a),
    mine: (...a: unknown[]) => mockMine(...a),
    available: (...a: unknown[]) => mockAvailable(...a),
    accept: (...a: unknown[]) => mockAccept(...a),
    confirmPickup: (...a: unknown[]) => mockConfirmPickup(...a),
    confirmDelivery: (...a: unknown[]) => mockConfirmDelivery(...a),
    fail: (...a: unknown[]) => mockFail(...a),
  }),
}));

jest.mock("@/auth-context", () => ({
  useAuth: () => ({ client: fakeClient }),
}));

const d1: DeliveryDTO = {
  id: "d1",
  orderGroupId: "g1",
  orderId: "order-000001",
  status: "assigned",
  storeId: "s1",
  storeName: "Loja 1",
  customerName: "Cliente",
  itemCount: 3,
};

let activeClient: QueryClient | null = null;

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

/**
 * Client estável para assertir cache escrito via setQueryData: com gcTime: 0 uma
 * entrada sem observador ativo é coletada imediatamente, deixando getQueryData
 * intermitentemente undefined sob workers paralelos (mesma classe do fix gcTime
 * Infinity já adotado no repo). gcTime: Infinity mantém o cache para a asserção.
 */
function stableClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

function renderHook<T>(useHook: () => T, client?: QueryClient) {
  const qc = client ?? newClient();
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
  mockStores.mockReset().mockResolvedValue([{ id: "s1", name: "Loja 1", merchantId: "m1" }]);
  mockMine.mockReset().mockResolvedValue([d1]);
  mockAvailable.mockReset().mockResolvedValue([]);
  mockAccept.mockReset().mockResolvedValue(d1);
  mockConfirmPickup.mockReset().mockResolvedValue({ ...d1, status: "picked_up" });
  mockConfirmDelivery.mockReset().mockResolvedValue({ ...d1, status: "delivered" });
  mockFail.mockReset().mockResolvedValue({ ...d1, status: "failed" });
});

afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("queryKeys.deliveries", () => {
  it("compõe chaves não-literais por escopo", () => {
    expect(queryKeys.deliveries.stores).toEqual(["deliveries", "stores"]);
    expect(queryKeys.deliveries.mine("s1")).toEqual(["deliveries", "mine", "s1"]);
    expect(queryKeys.deliveries.mine(null)).toEqual(["deliveries", "mine", "all"]);
    expect(queryKeys.deliveries.available(null)).toEqual(["deliveries", "available", "all"]);
    expect(queryKeys.deliveries.detail("d1")).toEqual(["deliveries", "detail", "d1"]);
    expect(queryKeys.deliveries.root).toEqual(["deliveries"]);
  });
});

describe("useDriverStores", () => {
  it("lista as lojas do entregador", async () => {
    const { result, unmount } = renderHook(() => useDriverStores());
    await waitFor(() => (result.current?.data?.length ?? 0) > 0);
    expect(mockStores).toHaveBeenCalled();
    expect(result.current?.data?.[0]?.id).toBe("s1");
    unmount();
  });
});

describe("useDriverDeliveries", () => {
  it("busca as entregas com o escopo da loja", async () => {
    const { result, unmount } = renderHook(() => useDriverDeliveries("s1"));
    await waitFor(() => result.current?.isSuccess === true);
    expect(mockMine).toHaveBeenCalledWith("s1");
    expect(result.current?.data?.[0]?.id).toBe("d1");
    unmount();
  });

  it("não busca quando enabled=false", async () => {
    const { result, unmount } = renderHook(() => useDriverDeliveries("s1", { enabled: false }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mockMine).not.toHaveBeenCalled();
    expect(result.current?.fetchStatus).toBe("idle");
    unmount();
  });
});

describe("useAvailableDeliveries", () => {
  it("busca o pool no escopo da loja", async () => {
    const { result, unmount } = renderHook(() => useAvailableDeliveries(null));
    await waitFor(() => result.current?.isSuccess === true);
    expect(mockAvailable).toHaveBeenCalledWith(null);
    unmount();
  });
});

describe("useAcceptDelivery", () => {
  it("aceita e invalida todas as queries de entrega", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.fn();
    const realInvalidate = client.invalidateQueries.bind(client);
    jest.spyOn(client, "invalidateQueries").mockImplementation((args) => {
      invalidateSpy(args);
      return realInvalidate(args);
    });
    const { result, unmount } = renderHook(() => useAcceptDelivery(), client);
    await act(async () => {
      await result.current!.mutateAsync("d1");
    });
    expect(mockAccept).toHaveBeenCalledWith("d1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.deliveries.root });
    unmount();
  });
});

describe("useDeliveryDetail", () => {
  it("deriva o detalhe da lista atribuída por id", async () => {
    const { result, unmount } = renderHook(() => useDeliveryDetail("d1"));
    await waitFor(() => result.current?.isSuccess === true);
    expect(mockMine).toHaveBeenCalledWith(null);
    expect(result.current?.data?.id).toBe("d1");
    unmount();
  });

  it("retorna null quando o id não está na lista", async () => {
    const { result, unmount } = renderHook(() => useDeliveryDetail("zzz"));
    await waitFor(() => result.current?.isSuccess === true);
    expect(result.current?.data).toBeNull();
    unmount();
  });

  it("não busca com id vazio", async () => {
    const { result, unmount } = renderHook(() => useDeliveryDetail(""));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current?.fetchStatus).toBe("idle");
    unmount();
  });
});

describe("useConfirmPickup / useConfirmDelivery", () => {
  it("coleta grava a entrega atualizada no cache do detalhe", async () => {
    const client = stableClient();
    const { result, unmount } = renderHook(() => useConfirmPickup("d1"), client);
    await act(async () => {
      await result.current!.mutateAsync("PC1");
    });
    expect(mockConfirmPickup).toHaveBeenCalledWith("d1", "PC1");
    const cached = client.getQueryData<DeliveryDTO>(queryKeys.deliveries.detail("d1"));
    expect(cached?.status).toBe("picked_up");
    unmount();
  });

  it("entrega grava a entrega entregue no cache do detalhe", async () => {
    const client = stableClient();
    const { result, unmount } = renderHook(() => useConfirmDelivery("d1"), client);
    await act(async () => {
      await result.current!.mutateAsync("DC1");
    });
    expect(mockConfirmDelivery).toHaveBeenCalledWith("d1", "DC1");
    const cached = client.getQueryData<DeliveryDTO>(queryKeys.deliveries.detail("d1"));
    expect(cached?.status).toBe("delivered");
    unmount();
  });
});

describe("useFailDelivery (story 61)", () => {
  it("reporta falha, grava failed no cache do detalhe e invalida as filas", async () => {
    const client = stableClient();
    const invalidateSpy = jest.fn();
    const realInvalidate = client.invalidateQueries.bind(client);
    jest.spyOn(client, "invalidateQueries").mockImplementation((args) => {
      invalidateSpy(args);
      return realInvalidate(args);
    });
    const { result, unmount } = renderHook(() => useFailDelivery("d1"), client);
    await act(async () => {
      await result.current!.mutateAsync({ reason: "customer_absent", note: "portão fechado" });
    });
    expect(mockFail).toHaveBeenCalledWith("d1", { reason: "customer_absent", note: "portão fechado" });
    const cached = client.getQueryData<DeliveryDTO>(queryKeys.deliveries.detail("d1"));
    expect(cached?.status).toBe("failed");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.deliveries.root });
    unmount();
  });
});
