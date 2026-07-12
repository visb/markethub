import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient, DriverAvailabilityDTO } from "@markethub/api-client";
import { useDriverAvailability, useSetAvailability } from "../api/hooks/useDriverAvailability";
import { queryKeys } from "../lib/queryKeys";

/**
 * Story 62: hooks do turno on/off. Mocka o módulo `@/api/availability` e o
 * auth-context (client fake). Verifica leitura do estado e a mutation OTIMISTA
 * com rollback (o cache reflete o alvo na hora; em erro, restaura o anterior).
 */

const mockGet = jest.fn();
const mockSet = jest.fn();
const fakeClient = {} as ApiClient;

jest.mock("../api/availability", () => ({
  availability: () => ({
    get: (...a: unknown[]) => mockGet(...a),
    set: (...a: unknown[]) => mockSet(...a),
  }),
}));

jest.mock("@/auth-context", () => ({
  useAuth: () => ({ client: fakeClient }),
}));

const off: DriverAvailabilityDTO = { available: false, availableSince: null };

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
  mockGet.mockReset().mockResolvedValue(off);
  mockSet.mockReset().mockResolvedValue({ available: true, availableSince: "2026-07-12T10:00:00.000Z" });
});

afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("queryKeys.availability", () => {
  it("current vem de queryKeys (não-literal)", () => {
    expect(queryKeys.availability.current).toEqual(["availability", "current"]);
  });
});

describe("useDriverAvailability", () => {
  it("lê o estado do turno via api/availability", async () => {
    const { result, unmount } = renderHook(() => useDriverAvailability());
    await waitFor(() => result.current?.isSuccess === true);
    expect(mockGet).toHaveBeenCalled();
    expect(result.current?.data).toEqual(off);
    unmount();
  });
});

describe("useSetAvailability (otimista + rollback)", () => {
  it("reflete o alvo otimista no cache antes da resposta", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.availability.current, off);
    let resolveSet: (v: DriverAvailabilityDTO) => void = () => {};
    mockSet.mockImplementation(() => new Promise<DriverAvailabilityDTO>((r) => (resolveSet = r)));
    const { result, unmount } = renderHook(() => useSetAvailability(), qc);
    act(() => {
      result.current!.mutate(true);
    });
    // otimista: available=true já no cache enquanto a promise não resolve
    await waitFor(() => qc.getQueryData<DriverAvailabilityDTO>(queryKeys.availability.current)?.available === true);
    await act(async () => {
      resolveSet({ available: true, availableSince: "2026-07-12T10:00:00.000Z" });
    });
    expect(mockSet).toHaveBeenCalledWith(true);
    unmount();
  });

  it("faz rollback ao estado anterior quando a chamada falha", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const previous: DriverAvailabilityDTO = { available: true, availableSince: "2026-07-12T08:00:00.000Z" };
    qc.setQueryData(queryKeys.availability.current, previous);
    mockSet.mockRejectedValue(new Error("network"));
    const { result, unmount } = renderHook(() => useSetAvailability(), qc);
    await act(async () => {
      await result.current!.mutateAsync(false).catch(() => undefined);
    });
    // rollback: volta ao estado anterior (available=true)
    expect(qc.getQueryData<DriverAvailabilityDTO>(queryKeys.availability.current)).toEqual(previous);
    unmount();
  });
});
