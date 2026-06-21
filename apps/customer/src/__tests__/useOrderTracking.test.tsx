import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient, RealtimeClient } from "@markethub/api-client";
import { useOrderTracking } from "../api/hooks/useOrderTracking";
import { queryKeys } from "../lib/queryKeys";
import type { OrderTracking } from "../api/marketplace";

/**
 * Story 02: hook de rastreio em tempo real. React Query é o store do snapshot.
 * Mocka useAuth (injeta api + mockRealtime fakes) e socket.io via mockRealtime fake.
 */

// ── fakes ──

function makeTracking(over: Partial<OrderTracking> = {}): OrderTracking {
  return {
    orderId: "ord_1",
    status: "picking",
    deliveryCode: null,
    hasPickup: false,
    hasDelivery: true,
    etaWindow: null,
    address: null,
    totalCents: 1000,
    groups: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

/** Realtime fake: registra handlers e permite disparar eventos no teste. */
function makeRealtime() {
  const handlers = new Map<string, (p: unknown) => void>();
  let connected = false;
  const rt = {
    connect: jest.fn(() => {
      connected = true;
      handlers.get("connect")?.(undefined);
    }),
    disconnect: jest.fn(() => {
      connected = false;
    }),
    on: jest.fn((event: string, h: (p: unknown) => void) => handlers.set(event, h)),
    emit: jest.fn(),
    subscribeOrder: jest.fn(),
    get connected() {
      return connected;
    },
  } as unknown as RealtimeClient & { __emit: (e: string, p: unknown) => void };
  return Object.assign(rt, {
    __emit: (event: string, p: unknown) => handlers.get(event)?.(p),
    __disconnect: () => {
      connected = false;
      handlers.get("disconnect")?.(undefined);
    },
  });
}

const mockTracking = jest.fn();
const mockSubstitutions = jest.fn();
let mockRealtime: ReturnType<typeof makeRealtime>;

const fakeApi = {} as ApiClient;

// Mock do módulo marketplace: a query usa mkt.tracking / mkt.substitutions.
jest.mock("../api/marketplace", () => {
  const actual = jest.requireActual("../api/marketplace");
  return {
    ...actual,
    marketplace: () => ({
      tracking: (...a: unknown[]) => mockTracking(...a),
      substitutions: (...a: unknown[]) => mockSubstitutions(...a),
      approveSubstitution: jest.fn(),
      rejectSubstitution: jest.fn(),
      cancelOrder: jest.fn(),
    }),
  };
});

// Mock do auth-context: injeta api + mockRealtime fakes.
jest.mock("@/auth-context", () => ({
  useAuth: () => ({ api: fakeApi, realtime: mockRealtime }),
}));

// ── harness ──

type HookResult = ReturnType<typeof useOrderTracking>;
let activeClient: QueryClient | null = null;

function renderHook(id: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  activeClient = client;
  const result: { current: HookResult | null } = { current: null };
  function Probe() {
    result.current = useOrderTracking(id);
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
  return {
    result,
    client,
    unmount: () => {
      act(() => tree!.unmount());
      client.clear();
    },
  };
}

// Aguarda a query (queryFn + notify de timers do React Query) assentar.
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
  });

/** Reexecuta o tick do event loop até o predicado valer (ou estourar tentativas). */
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
  mockTracking.mockReset().mockResolvedValue(makeTracking());
  mockSubstitutions.mockReset().mockResolvedValue([]);
  mockRealtime = makeRealtime();
});

afterEach(() => {
  // Encerra qualquer query/refetch pendente para não vazar entre testes.
  activeClient?.clear();
  activeClient = null;
});

describe("useOrderTracking", () => {
  it("load inicial popula o snapshot via REST", async () => {
    const { result, unmount } = renderHook("ord_1");
    await waitFor(() => result.current?.tracking?.orderId === "ord_1");
    expect(mockTracking).toHaveBeenCalledWith("ord_1");
    expect(result.current?.tracking?.orderId).toBe("ord_1");
    unmount();
  });

  it("conecta e assina o canal do pedido", async () => {
    const { unmount } = renderHook("ord_1");
    await waitFor(() => (mockRealtime.connect as jest.Mock).mock.calls.length > 0);
    expect(mockRealtime.connect).toHaveBeenCalled();
    expect(mockRealtime.subscribeOrder).toHaveBeenCalledWith("ord_1");
    unmount();
  });

  it("evento order.updated atualiza o cache SEM novo refetch REST", async () => {
    const { result, unmount } = renderHook("ord_1");
    await waitFor(() => result.current?.tracking?.orderId === "ord_1");
    const callsAfterLoad = mockTracking.mock.calls.length;

    act(() => {
      mockRealtime.__emit("order.updated", makeTracking({ status: "ready_for_pickup", totalCents: 2000 }));
    });
    await waitFor(() => result.current?.tracking?.status === "ready_for_pickup");

    expect(result.current?.tracking?.status).toBe("ready_for_pickup");
    expect(result.current?.tracking?.totalCents).toBe(2000);
    // snapshot aplicado direto: nenhuma chamada REST adicional disparada pelo evento.
    expect(mockTracking.mock.calls.length).toBe(callsAfterLoad);
    unmount();
  });

  it("fallback: socket desconectado → refetch por intervalo", async () => {
    jest.useFakeTimers();
    try {
      const { unmount } = renderHook("ord_1");
      // resolve a query inicial
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      const afterLoad = mockTracking.mock.calls.length;

      // desconecta → o refetchInterval passa a valer
      act(() => mockRealtime.__disconnect());
      await act(async () => {
        jest.advanceTimersByTime(20_000);
        await Promise.resolve();
      });
      expect(mockTracking.mock.calls.length).toBeGreaterThan(afterLoad);
      unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it("cleanup ao desmontar: desconecta o socket", async () => {
    const { unmount } = renderHook("ord_1");
    await waitFor(() => (mockRealtime.connect as jest.Mock).mock.calls.length > 0);
    unmount();
    expect(mockRealtime.disconnect).toHaveBeenCalled();
  });

  it("estado terminal não conecta o socket (delivered)", async () => {
    mockTracking.mockResolvedValue(makeTracking({ status: "delivered" }));
    const { result, unmount } = renderHook("ord_1");
    // espera o load assentar como delivered, então confirma que NÃO conectou
    await waitFor(() => result.current?.tracking?.status === "delivered");
    await flush();
    expect(mockRealtime.connect).not.toHaveBeenCalled();
    unmount();
  });

  it("substituições carregam só quando há pendência (toApprove > 0)", async () => {
    mockTracking.mockResolvedValue(
      makeTracking({
        groups: [
          {
            orderGroupId: "g1",
            storeId: "s1",
            storeName: "Loja",
            merchantId: "m1",
            merchantName: "M",
            merchantLogoUrl: null,
            fulfillment: "delivery",
            status: "picking",
            subtotalCents: 1000,
            picking: { total: 3, toApprove: 1, picked: 1, refused: 0, pending: 1 },
            delivery: null,
          },
        ],
      }),
    );
    mockSubstitutions.mockResolvedValue([{ id: "sub1" }]);
    const { result, unmount } = renderHook("ord_1");
    await waitFor(() => result.current?.substitutions.length === 1);
    expect(mockSubstitutions).toHaveBeenCalledWith("ord_1");
    expect(result.current?.substitutions).toHaveLength(1);
    unmount();
  });

  it("queryKey do tracking vem de queryKeys (não-literal)", () => {
    expect(queryKeys.tracking.order("ord_1")).toEqual(["tracking", "order", "ord_1"]);
  });
});

describe("tela track/[id] — orquestra o hook (não faz fetch inline)", () => {
  // require lazy via indireção sem depender de @types/node no typecheck do app.
  const nodeRequire = (eval("require") as (id: string) => unknown) as (
    id: string,
  ) => { readFileSync: (p: string, enc: string) => string };
  const cwd = (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? ".";
  const fsMod = nodeRequire("fs");
  const screen = fsMod.readFileSync(`${cwd}/app/track/[id].tsx`, "utf8");

  it("não importa React Query nem setInterval diretamente", () => {
    expect(screen).not.toMatch(/@tanstack\/react-query/);
    expect(screen).not.toMatch(/useQuery|useMutation/);
    expect(screen).not.toMatch(/setInterval/);
  });

  it("consome o hook useOrderTracking", () => {
    expect(screen).toMatch(/useOrderTracking/);
  });
});
