import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient, RealtimeClient } from "@markethub/api-client";
import { SUBSTITUTION_RESOLVED_EVENT } from "@markethub/api-client";
import {
  usePickCompletePicking,
  usePickReady,
  usePickStart,
  usePickSubstitute,
  usePickTask,
  usePickTaskRealtime,
  usePickUpdateItem,
  useStoreHandover,
  useSubstituteSearch,
} from "../api/hooks/usePickTask";
import type { SubOffer } from "../api/picking";
import { queryKeys } from "../lib/queryKeys";

/**
 * Story 03: autocomplete de substituto + tela de separação em React Query.
 * Mocka o módulo `picking` e o `auth-context`; React Query é o store.
 */

const mockTask = jest.fn();
const mockSearchOffers = jest.fn();
const mockSubstitute = jest.fn();
const mockStart = jest.fn();
const mockUpdateItem = jest.fn();
const mockCompletePicking = jest.fn();
const mockReady = jest.fn();
const mockStoreHandover = jest.fn();

const fakeClient = {} as ApiClient;

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
  });
}

let mockRealtime: ReturnType<typeof makeRealtime>;

jest.mock("../api/picking", () => ({
  picking: () => ({
    task: (...a: unknown[]) => mockTask(...a),
    searchOffers: (...a: unknown[]) => mockSearchOffers(...a),
    substitute: (...a: unknown[]) => mockSubstitute(...a),
    start: (...a: unknown[]) => mockStart(...a),
    updateItem: (...a: unknown[]) => mockUpdateItem(...a),
    completePicking: (...a: unknown[]) => mockCompletePicking(...a),
    ready: (...a: unknown[]) => mockReady(...a),
    storeHandover: (...a: unknown[]) => mockStoreHandover(...a),
  }),
}));

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
    rerender: () => act(() => tree!.update(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    )),
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

function makeOffer(over: Partial<SubOffer> = {}): SubOffer {
  return { offerId: "off_1", name: "Arroz 5kg", priceCents: 2500, promoPriceCents: null, ...over };
}

beforeEach(() => {
  mockTask.mockReset().mockResolvedValue({ id: "task_1", storeId: "store_1", items: [] });
  mockSearchOffers.mockReset().mockResolvedValue([makeOffer()]);
  mockSubstitute.mockReset().mockResolvedValue({});
  mockStart.mockReset().mockResolvedValue({});
  mockUpdateItem.mockReset().mockResolvedValue({});
  mockCompletePicking.mockReset().mockResolvedValue({});
  mockReady.mockReset().mockResolvedValue({});
  mockStoreHandover.mockReset().mockResolvedValue({});
  mockRealtime = makeRealtime();
});

afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("usePickTask", () => {
  it("carrega a tarefa via módulo tipado", async () => {
    const { result, unmount } = renderHook(() => usePickTask("task_1"));
    await waitFor(() => !!result.current?.data);
    expect(mockTask).toHaveBeenCalledWith("task_1");
    expect(result.current?.data?.id).toBe("task_1");
    unmount();
  });

  it("id vazio não dispara a query", async () => {
    const { result, unmount } = renderHook(() => usePickTask(""));
    await flush();
    expect(mockTask).not.toHaveBeenCalled();
    expect(result.current?.data).toBeUndefined();
    unmount();
  });
});

describe("usePickTaskRealtime (story 64)", () => {
  it("conecta e assina a store room da tarefa", async () => {
    const { unmount } = renderHook(() => usePickTaskRealtime("task_1", "store_1"));
    await waitFor(() => (mockRealtime.connect as jest.Mock).mock.calls.length > 0);
    expect(mockRealtime.connect).toHaveBeenCalled();
    expect(mockRealtime.subscribeStore).toHaveBeenCalledWith("store_1");
    unmount();
  });

  it("evento substitution.resolved invalida a task (refetch de reconciliação)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    activeClient = client;
    const invalidateSpy = jest.fn();
    const realInvalidate = client.invalidateQueries.bind(client);
    jest.spyOn(client, "invalidateQueries").mockImplementation((args) => {
      invalidateSpy(args);
      return realInvalidate(args);
    });
    function Probe() {
      usePickTaskRealtime("task_1", "store_1");
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
    await waitFor(() => (mockRealtime.connect as jest.Mock).mock.calls.length > 0);
    invalidateSpy.mockClear();
    act(() => {
      mockRealtime.__emit(SUBSTITUTION_RESOLVED_EVENT, {
        pickItemId: "i1",
        approvalStatus: "approved",
      });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.pick.task("task_1") });
    act(() => tree!.unmount());
  });

  it("sem storeId: não conecta nem assina", async () => {
    const { unmount } = renderHook(() => usePickTaskRealtime("task_1", null));
    await flush();
    expect(mockRealtime.connect).not.toHaveBeenCalled();
    expect(mockRealtime.subscribeStore).not.toHaveBeenCalled();
    unmount();
  });

  it("cleanup ao desmontar: desconecta o socket", async () => {
    const { unmount } = renderHook(() => usePickTaskRealtime("task_1", "store_1"));
    await waitFor(() => (mockRealtime.connect as jest.Mock).mock.calls.length > 0);
    unmount();
    expect(mockRealtime.disconnect).toHaveBeenCalled();
  });
});

describe("useSubstituteSearch", () => {
  it("q com 1 caractere → não chama a API (query disabled)", async () => {
    const { result, unmount } = renderHook(() => useSubstituteSearch("store_1", "a"));
    await flush();
    expect(mockSearchOffers).not.toHaveBeenCalled();
    expect(result.current?.data).toBeUndefined();
    unmount();
  });

  it("q com ≥2 caracteres → chama searchOffers(storeId, q) e popula a lista", async () => {
    const { result, unmount } = renderHook(() => useSubstituteSearch("store_1", "arroz"));
    await waitFor(() => (result.current?.data?.length ?? 0) > 0);
    expect(mockSearchOffers).toHaveBeenCalledWith("store_1", "arroz");
    expect(result.current?.data?.[0]?.offerId).toBe("off_1");
    unmount();
  });

  it("storeId ausente → não chama a API", async () => {
    const { result, unmount } = renderHook(() => useSubstituteSearch(undefined, "arroz"));
    await flush();
    expect(mockSearchOffers).not.toHaveBeenCalled();
    expect(result.current?.data).toBeUndefined();
    unmount();
  });

  it("usa o termo trimado na chamada (whitespace não conta p/ o gate)", async () => {
    const { result, unmount } = renderHook(() => useSubstituteSearch("store_1", "  a "));
    await flush();
    // "a" após trim tem 1 caractere → não dispara
    expect(mockSearchOffers).not.toHaveBeenCalled();
    expect(result.current?.data).toBeUndefined();
    unmount();
  });
});

describe("usePickSubstitute", () => {
  it("on success invalida queryKeys.pick.task(id)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    activeClient = client;
    const invalidateSpy = jest.fn();
    const realInvalidate = client.invalidateQueries.bind(client);
    jest.spyOn(client, "invalidateQueries").mockImplementation((args) => {
      invalidateSpy(args);
      return realInvalidate(args);
    });
    let mutation: ReturnType<typeof usePickSubstitute> | null = null;
    function Probe() {
      mutation = usePickSubstitute("task_1");
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
    await act(async () => {
      await mutation!.mutateAsync({ itemId: "item_1", substituteOfferId: "off_1" });
    });
    expect(mockSubstitute).toHaveBeenCalledWith("task_1", "item_1", "off_1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.pick.task("task_1") });
    act(() => tree!.unmount());
  });
});

describe("mutations da tela invalidam a task e chamam o módulo", () => {
  function mountMutation<T>(useHook: () => T) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    activeClient = client;
    const invalidateSpy = jest.fn();
    const realInvalidate = client.invalidateQueries.bind(client);
    jest.spyOn(client, "invalidateQueries").mockImplementation((args) => {
      invalidateSpy(args);
      return realInvalidate(args);
    });
    let mutation: T | null = null;
    function Probe() {
      mutation = useHook();
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
    return { getMutation: () => mutation!, invalidateSpy, unmount: () => act(() => tree!.unmount()) };
  }

  it("usePickStart → start(id) + invalida a task", async () => {
    const { getMutation, invalidateSpy, unmount } = mountMutation(() => usePickStart("task_1"));
    await act(async () => {
      await (getMutation() as ReturnType<typeof usePickStart>).mutateAsync();
    });
    expect(mockStart).toHaveBeenCalledWith("task_1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.pick.task("task_1") });
    unmount();
  });

  it("usePickUpdateItem → updateItem(id, itemId, input) + invalida a task", async () => {
    const { getMutation, invalidateSpy, unmount } = mountMutation(() => usePickUpdateItem("task_1"));
    await act(async () => {
      await (getMutation() as ReturnType<typeof usePickUpdateItem>).mutateAsync({
        itemId: "item_1",
        input: { action: "pick", quantityPicked: 2 },
      });
    });
    expect(mockUpdateItem).toHaveBeenCalledWith("task_1", "item_1", { action: "pick", quantityPicked: 2 });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.pick.task("task_1") });
    unmount();
  });

  it("usePickCompletePicking → completePicking(id) + invalida a task", async () => {
    const { getMutation, invalidateSpy, unmount } = mountMutation(() => usePickCompletePicking("task_1"));
    await act(async () => {
      await (getMutation() as ReturnType<typeof usePickCompletePicking>).mutateAsync();
    });
    expect(mockCompletePicking).toHaveBeenCalledWith("task_1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.pick.task("task_1") });
    unmount();
  });

  it("usePickReady → ready(id) + invalida a task", async () => {
    const { getMutation, invalidateSpy, unmount } = mountMutation(() => usePickReady("task_1"));
    await act(async () => {
      await (getMutation() as ReturnType<typeof usePickReady>).mutateAsync();
    });
    expect(mockReady).toHaveBeenCalledWith("task_1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.pick.task("task_1") });
    unmount();
  });

  it("useStoreHandover → storeHandover(orderGroupId, code) + invalida a task", async () => {
    const { getMutation, invalidateSpy, unmount } = mountMutation(() => useStoreHandover("task_1"));
    await act(async () => {
      await (getMutation() as ReturnType<typeof useStoreHandover>).mutateAsync({
        orderGroupId: "grp_1",
        code: "1234",
      });
    });
    expect(mockStoreHandover).toHaveBeenCalledWith("grp_1", "1234");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.pick.task("task_1") });
    unmount();
  });
});

describe("queryKeys.pick (story 03)", () => {
  it("task/search vêm de queryKeys (não-literal)", () => {
    expect(queryKeys.pick.task("task_1")).toEqual(["pick", "task", "task_1"]);
    expect(queryKeys.pick.search("store_1", "arroz")).toEqual(["pick", "search", "store_1", "arroz"]);
  });
});

describe("tela task — orquestra hooks (não faz fetch inline)", () => {
  const nodeRequire = (eval("require") as (id: string) => unknown) as (
    id: string,
  ) => { readFileSync: (p: string, enc: string) => string };
  const cwd = (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? ".";
  const fsMod = nodeRequire("fs");
  const screen = fsMod.readFileSync(`${cwd}/app/task/[id].tsx`, "utf8");

  it("não importa React Query nem faz fetch inline", () => {
    expect(screen).not.toMatch(/@tanstack\/react-query/);
    expect(screen).not.toMatch(/useQuery|useMutation/);
    expect(screen).not.toMatch(/client\.request|client\.pick|client\.storeHandover/);
  });

  it("consome os hooks de task e o autocomplete debounced", () => {
    expect(screen).toMatch(/usePickTask/);
    expect(screen).toMatch(/useSubstituteSearch/);
    expect(screen).toMatch(/useDebouncedValue/);
  });
});
