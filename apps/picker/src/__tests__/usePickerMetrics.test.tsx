import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient, PickerMetricsDTO, PickerMetricsPeriodDTO } from "@markethub/api-client";
import { usePickerMetrics } from "../api/hooks/usePickerMetrics";
import { queryKeys } from "../lib/queryKeys";

/**
 * Story 65: hook das métricas próprias do separador. O período faz parte da
 * query key — trocar o período refaz a busca. Client mockado, sem rede.
 */

const mockMetrics = jest.fn();

jest.mock("../api/picking", () => ({
  picking: () => ({
    metrics: (...a: unknown[]) => mockMetrics(...a),
  }),
}));

jest.mock("@/auth-context", () => ({
  useAuth: () => ({ client: {} as ApiClient }),
}));

function makeMetrics(over: Partial<PickerMetricsDTO> = {}): PickerMetricsDTO {
  return {
    period: "today",
    tasksCompleted: 3,
    itemsPicked: 27,
    itemsPerHour: 18.5,
    substitutionRate: 0.1,
    refusalRate: 0,
    ...over,
  };
}

let activeClient: QueryClient | null = null;

function renderHook(initial: PickerMetricsPeriodDTO) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  activeClient = client;
  const result: { current: ReturnType<typeof usePickerMetrics> | null } = { current: null };
  let setPeriod: (p: PickerMetricsPeriodDTO) => void = () => undefined;
  function Probe() {
    const [period, set] = React.useState<PickerMetricsPeriodDTO>(initial);
    setPeriod = set;
    result.current = usePickerMetrics(period);
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
    setPeriod: (p: PickerMetricsPeriodDTO) => act(() => setPeriod(p)),
    unmount: () => {
      act(() => tree!.unmount());
      client.clear();
    },
  };
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
  mockMetrics.mockReset().mockResolvedValue(makeMetrics());
});

afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("usePickerMetrics", () => {
  it("carrega as métricas do período via módulo tipado", async () => {
    const { result, unmount } = renderHook("today");
    await waitFor(() => result.current?.data != null);
    expect(mockMetrics).toHaveBeenCalledWith("today");
    expect(result.current?.data?.itemsPicked).toBe(27);
    unmount();
  });

  it("trocar o período refaz a busca (período na query key)", async () => {
    const { result, setPeriod, unmount } = renderHook("today");
    await waitFor(() => result.current?.data != null);
    mockMetrics.mockResolvedValue(makeMetrics({ period: "30d", tasksCompleted: 10 }));
    setPeriod("30d");
    await waitFor(() => result.current?.data?.period === "30d");
    expect(mockMetrics).toHaveBeenLastCalledWith("30d");
    expect(result.current?.data?.tasksCompleted).toBe(10);
    unmount();
  });

  it("query key vem de queryKeys (não-literal)", () => {
    expect(queryKeys.pick.metrics("7d")).toEqual(["pick", "metrics", "7d"]);
  });
});
