import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient, DeliveryHistoryPageDTO, DriverEarningsDTO } from "@markethub/api-client";
import { useDeliveryHistory, useDriverEarnings } from "../api/hooks/useDriverEarnings";
import { queryKeys } from "../lib/queryKeys";

/**
 * Story 60: hooks de dados dos ganhos/histórico. Mocka o módulo `@/api/earnings` e o
 * auth-context. Verifica query keys por período, o acúmulo de páginas do histórico
 * (useInfiniteQuery) e o loadMore condicionado a hasMore.
 */

const mockSummary = jest.fn();
const mockHistory = jest.fn();
const fakeClient = {} as ApiClient;

jest.mock("../api/earnings", () => ({
  earnings: () => ({
    summary: (...a: unknown[]) => mockSummary(...a),
    history: (...a: unknown[]) => mockHistory(...a),
  }),
}));

jest.mock("@/auth-context", () => ({
  useAuth: () => ({ client: fakeClient }),
}));

const summary: DriverEarningsDTO = {
  period: "today",
  tipsPaidCents: 1500,
  tipsPaidCount: 3,
  tipsPendingCents: 200,
  deliveriesCompleted: 4,
};

function page(n: number, hasMore: boolean): DeliveryHistoryPageDTO {
  return {
    items: [{ id: `d${n}`, orderId: `o${n}`, status: "delivered", storeName: "Loja", date: "2026-07-10T10:00:00.000Z" }],
    page: n,
    pageSize: 20,
    hasMore,
  };
}

let activeClient: QueryClient | null = null;

function renderHook<T>(useHook: () => T) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
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
  return { result, unmount: () => act(() => tree!.unmount()) };
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
  mockSummary.mockReset().mockResolvedValue(summary);
  mockHistory.mockReset().mockImplementation((p: number) => Promise.resolve(page(p, p < 2)));
});

afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("queryKeys.earnings/history", () => {
  it("compõe chaves não-literais", () => {
    expect(queryKeys.earnings.byPeriod("7d")).toEqual(["earnings", "7d"]);
    // story 79: a chave do histórico inclui o período (troca de chip refaz a lista)
    expect(queryKeys.deliveries.history("7d")).toEqual(["deliveries", "history", "7d"]);
    expect(queryKeys.deliveries.history("30d")).toEqual(["deliveries", "history", "30d"]);
  });
});

describe("useDriverEarnings", () => {
  it("busca o resumo com o período informado", async () => {
    const { result, unmount } = renderHook(() => useDriverEarnings("7d"));
    await waitFor(() => result.current?.isSuccess === true);
    expect(mockSummary).toHaveBeenCalledWith("7d");
    expect(result.current?.data?.tipsPaidCents).toBe(1500);
    unmount();
  });
});

describe("useDeliveryHistory", () => {
  it("carrega a primeira página com o período e expõe hasMore", async () => {
    const { result, unmount } = renderHook(() => useDeliveryHistory("today"));
    await waitFor(() => result.current?.items.length === 1);
    expect(mockHistory).toHaveBeenCalledWith(1, "today");
    expect(result.current?.hasMore).toBe(true);
    unmount();
  });

  it("loadMore acumula a próxima página (mesmo período)", async () => {
    const { result, unmount } = renderHook(() => useDeliveryHistory("today"));
    await waitFor(() => result.current?.items.length === 1);
    await act(async () => {
      result.current!.loadMore();
    });
    await waitFor(() => result.current?.items.length === 2);
    expect(mockHistory).toHaveBeenCalledWith(2, "today");
    expect(result.current?.hasMore).toBe(false);
    unmount();
  });

  it("loadMore não faz nada quando não há mais páginas", async () => {
    mockHistory.mockReset().mockResolvedValue(page(1, false));
    const { result, unmount } = renderHook(() => useDeliveryHistory("today"));
    await waitFor(() => result.current?.items.length === 1);
    await act(async () => {
      result.current!.loadMore();
    });
    expect(mockHistory).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("trocar de período refaz a lista a partir da page 1 (story 79)", async () => {
    // Cache compartilhado entre renders p/ simular a troca de chip na mesma tela.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    activeClient = qc;
    const result: { current: ReturnType<typeof useDeliveryHistory> | null } = { current: null };
    function Probe({ period }: { period: "today" | "7d" | "30d" }) {
      result.current = useDeliveryHistory(period);
      return null;
    }
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <QueryClientProvider client={qc}>
          <Probe period="today" />
        </QueryClientProvider>,
      );
    });
    await waitFor(() => result.current?.items.length === 1);
    // avança para a página 2 no período "today"
    await act(async () => {
      result.current!.loadMore();
    });
    await waitFor(() => result.current?.items.length === 2);

    // troca o chip para "7d": nova query key → começa da page 1 (não acumula as 2 anteriores)
    act(() => {
      tree!.update(
        <QueryClientProvider client={qc}>
          <Probe period="7d" />
        </QueryClientProvider>,
      );
    });
    await waitFor(() => result.current?.items.length === 1);
    expect(mockHistory).toHaveBeenCalledWith(1, "7d");
    act(() => tree!.unmount());
  });

  it("período sem entregas expõe lista vazia (empty state)", async () => {
    mockHistory.mockReset().mockResolvedValue({ items: [], page: 1, pageSize: 20, hasMore: false });
    const { result, unmount } = renderHook(() => useDeliveryHistory("today"));
    await waitFor(() => result.current?.isLoading === false);
    expect(result.current?.items).toEqual([]);
    expect(result.current?.hasMore).toBe(false);
    unmount();
  });
});
