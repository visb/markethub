import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient, PickTaskDTO, PickStore, RealtimeClient } from "@markethub/api-client";
import { usePickQueue, usePickStores, usePickAssign } from "../api/hooks/usePickQueue";
import { queryKeys } from "../lib/queryKeys";

/**
 * Story 02: fila do separador em tempo real. React Query é o store do snapshot.
 * Mocka useAuth (injeta client + mockRealtime fakes) e socket via mockRealtime fake.
 */

// ── fakes ──

function makeTask(over: Partial<PickTaskDTO> = {}): PickTaskDTO {
  return {
    id: "task_1",
    orderGroupId: "grp_1",
    storeId: "store_1",
    status: "queued",
    pickerId: null,
    items: [],
    ...over,
  } as PickTaskDTO;
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
    subscribeStore: jest.fn(),
    get connected() {
      return connected;
    },
  } as unknown as RealtimeClient;
  return Object.assign(rt, {
    __emit: (event: string, p: unknown) => handlers.get(event)?.(p),
    __disconnect: () => {
      connected = false;
      handlers.get("disconnect")?.(undefined);
    },
  });
}

const mockQueue = jest.fn();
const mockStores = jest.fn();
const mockAssign = jest.fn();
let mockRealtime: ReturnType<typeof makeRealtime>;

const fakeClient = {} as ApiClient;

// Mock do módulo picking: os hooks usam picking(client).queue/stores/assign.
jest.mock("../api/picking", () => ({
  picking: () => ({
    stores: (...a: unknown[]) => mockStores(...a),
    queue: (...a: unknown[]) => mockQueue(...a),
    assign: (...a: unknown[]) => mockAssign(...a),
  }),
}));

// Mock do auth-context: injeta client + mockRealtime fakes.
jest.mock("@/auth-context", () => ({
  useAuth: () => ({ client: fakeClient, realtime: mockRealtime }),
}));

// ── harness ──

let activeClient: QueryClient | null = null;

function renderHook<T>(useHook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
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
  return {
    result,
    client,
    unmount: () => {
      act(() => tree!.unmount());
      client.clear();
    },
  };
}

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
  });

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
  mockQueue.mockReset().mockResolvedValue([makeTask()]);
  mockStores.mockReset().mockResolvedValue([{ id: "store_1", name: "Loja 1", merchantId: "m1" } as PickStore]);
  mockAssign.mockReset().mockResolvedValue(makeTask({ status: "assigned" }));
  mockRealtime = makeRealtime();
});

afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("usePickStores", () => {
  it("carrega as lojas via REST", async () => {
    const { result, unmount } = renderHook(() => usePickStores());
    await waitFor(() => (result.current?.data?.length ?? 0) > 0);
    expect(mockStores).toHaveBeenCalled();
    expect(result.current?.data?.[0]?.id).toBe("store_1");
    unmount();
  });
});

describe("usePickQueue", () => {
  it("load inicial popula a fila via REST", async () => {
    const { result, unmount } = renderHook(() => usePickQueue("store_1"));
    await waitFor(() => (result.current?.tasks.length ?? 0) > 0);
    expect(mockQueue).toHaveBeenCalledWith("store_1");
    expect(result.current?.tasks[0]?.id).toBe("task_1");
    unmount();
  });

  it("conecta e assina o canal da loja (subscribeStore)", async () => {
    const { unmount } = renderHook(() => usePickQueue("store_1"));
    await waitFor(() => (mockRealtime.connect as jest.Mock).mock.calls.length > 0);
    expect(mockRealtime.connect).toHaveBeenCalled();
    expect(mockRealtime.subscribeStore).toHaveBeenCalledWith("store_1");
    unmount();
  });

  it("evento pick_task.updated invalida a fila (nova tarefa aparece)", async () => {
    const { result, unmount } = renderHook(() => usePickQueue("store_1"));
    await waitFor(() => (result.current?.tasks.length ?? 0) === 1);

    // backend passa a devolver duas tarefas; o evento dispara o refetch.
    mockQueue.mockResolvedValue([makeTask(), makeTask({ id: "task_2", orderGroupId: "grp_2" })]);
    act(() => {
      mockRealtime.__emit("pick_task.updated", { pickTaskId: "task_2", storeId: "store_1" });
    });
    await waitFor(() => (result.current?.tasks.length ?? 0) === 2);

    expect(result.current?.tasks.map((t) => t.id)).toEqual(["task_1", "task_2"]);
    unmount();
  });

  it("socket conectado → sem polling; desconectado → fallback de polling ativa", async () => {
    jest.useFakeTimers();
    try {
      const { unmount } = renderHook(() => usePickQueue("store_1"));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      // conectado: avançar o tempo não dispara refetch adicional
      const afterConnect = mockQueue.mock.calls.length;
      await act(async () => {
        jest.advanceTimersByTime(20_000);
        await Promise.resolve();
      });
      expect(mockQueue.mock.calls.length).toBe(afterConnect);

      // desconecta → o refetchInterval passa a valer
      act(() => mockRealtime.__disconnect());
      await act(async () => {
        jest.advanceTimersByTime(20_000);
        await Promise.resolve();
      });
      expect(mockQueue.mock.calls.length).toBeGreaterThan(afterConnect);
      unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it("cleanup ao desmontar: desconecta o socket", async () => {
    const { unmount } = renderHook(() => usePickQueue("store_1"));
    await waitFor(() => (mockRealtime.connect as jest.Mock).mock.calls.length > 0);
    unmount();
    expect(mockRealtime.disconnect).toHaveBeenCalled();
  });

  it("storeId nulo não busca nem conecta", async () => {
    const { result, unmount } = renderHook(() => usePickQueue(null));
    await flush();
    expect(mockQueue).not.toHaveBeenCalled();
    expect(mockRealtime.connect).not.toHaveBeenCalled();
    expect(result.current?.tasks).toEqual([]);
    unmount();
  });
});

describe("usePickAssign", () => {
  it("assume a tarefa e invalida a fila da loja", async () => {
    const invalidateSpy = jest.fn();
    function Probe({ onReady }: { onReady: (m: ReturnType<typeof usePickAssign>) => void }) {
      const m = usePickAssign("store_1");
      onReady(m);
      return null;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    activeClient = client;
    const realInvalidate = client.invalidateQueries.bind(client);
    jest.spyOn(client, "invalidateQueries").mockImplementation((args) => {
      invalidateSpy(args);
      return realInvalidate(args);
    });
    let mutation: ReturnType<typeof usePickAssign> | null = null;
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <QueryClientProvider client={client}>
          <Probe onReady={(m) => (mutation = m)} />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await mutation!.mutateAsync("task_1");
    });
    expect(mockAssign).toHaveBeenCalledWith("task_1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.pick.queue("store_1") });
    act(() => tree!.unmount());
  });
});

describe("queryKeys.pick", () => {
  it("queue/stores vêm de queryKeys (não-literal)", () => {
    expect(queryKeys.pick.stores).toEqual(["pick", "stores"]);
    expect(queryKeys.pick.queue("store_1")).toEqual(["pick", "queue", "store_1"]);
  });
});

describe("tela home — orquestra hooks (não faz fetch inline)", () => {
  const nodeRequire = (eval("require") as (id: string) => unknown) as (
    id: string,
  ) => { readFileSync: (p: string, enc: string) => string };
  const cwd = (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? ".";
  const fsMod = nodeRequire("fs");
  const screen = fsMod.readFileSync(`${cwd}/app/home.tsx`, "utf8");

  it("não importa React Query nem faz fetch inline", () => {
    expect(screen).not.toMatch(/@tanstack\/react-query/);
    expect(screen).not.toMatch(/useQuery|useMutation/);
    expect(screen).not.toMatch(/setInterval/);
  });

  it("consome os hooks de fila", () => {
    expect(screen).toMatch(/usePickQueue|usePickStores/);
  });
});
