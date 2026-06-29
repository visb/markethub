import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient, DriverVehicleDTO } from "@markethub/api-client";
import {
  useCurrentVehicle,
  useDriverVehicles,
  useSelectVehicle,
} from "../api/hooks/useDriverVehicle";
import { queryKeys } from "../lib/queryKeys";

/**
 * Story 15: hooks de seleção de veículo. Mocka o módulo `@/api/vehicles` e o
 * auth-context (injeta um client fake). Verifica chamada certa + invalidação.
 */

const mockList = jest.fn();
const mockCurrent = jest.fn();
const mockSelect = jest.fn();

const fakeClient = {} as ApiClient;

jest.mock("../api/vehicles", () => ({
  vehicles: () => ({
    list: (...a: unknown[]) => mockList(...a),
    current: (...a: unknown[]) => mockCurrent(...a),
    select: (...a: unknown[]) => mockSelect(...a),
  }),
}));

jest.mock("@/auth-context", () => ({
  useAuth: () => ({ client: fakeClient }),
}));

const vehicle: DriverVehicleDTO = { id: "v1", plate: "ABC1D23", type: "car", description: null };

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
  mockList.mockReset().mockResolvedValue([vehicle]);
  mockCurrent.mockReset().mockResolvedValue(null);
  mockSelect.mockReset().mockResolvedValue(vehicle);
});

afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("queryKeys.vehicles", () => {
  it("all/current vêm de queryKeys (não-literal)", () => {
    expect(queryKeys.vehicles.all).toEqual(["vehicles", "all"]);
    expect(queryKeys.vehicles.current).toEqual(["vehicles", "current"]);
  });
});

describe("useDriverVehicles", () => {
  it("lista os veículos via api/vehicles", async () => {
    const { result, unmount } = renderHook(() => useDriverVehicles());
    await waitFor(() => (result.current?.data?.length ?? 0) > 0);
    expect(mockList).toHaveBeenCalled();
    expect(result.current?.data?.[0]?.id).toBe("v1");
    unmount();
  });
});

describe("useCurrentVehicle", () => {
  it("retorna o veículo atual (null quando nada selecionado)", async () => {
    const { result, unmount } = renderHook(() => useCurrentVehicle());
    await waitFor(() => result.current?.isSuccess === true);
    expect(mockCurrent).toHaveBeenCalled();
    expect(result.current?.data).toBeNull();
    unmount();
  });

  it("não busca quando enabled=false", async () => {
    const { result, unmount } = renderHook(() => useCurrentVehicle({ enabled: false }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mockCurrent).not.toHaveBeenCalled();
    expect(result.current?.fetchStatus).toBe("idle");
    unmount();
  });
});

describe("useSelectVehicle", () => {
  it("seleciona e invalida o veículo atual", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const realInvalidate = client.invalidateQueries.bind(client);
    const invalidateSpy = jest.fn();
    jest.spyOn(client, "invalidateQueries").mockImplementation((args) => {
      invalidateSpy(args);
      return realInvalidate(args);
    });
    const { result, unmount } = renderHook(() => useSelectVehicle(), client);
    await act(async () => {
      await result.current!.mutateAsync("v1");
    });
    expect(mockSelect).toHaveBeenCalledWith("v1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.vehicles.current });
    unmount();
  });
});
