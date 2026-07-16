import React from "react";
import { ActivityIndicator, Pressable } from "react-native";
import renderer, { act } from "react-test-renderer";
import { Text } from "@markethub/ui";
import type { PickerMetricsDTO } from "@markethub/api-client";
import MetricsScreen from "../../app/metrics";

/**
 * Story 65: tela "Meu desempenho" (app/metrics.tsx). A tela vive em app/ — fora
 * do collectCoverageFrom — logo é regressão de comportamento por render: cards
 * (tarefas/itens/itens-h), taxas, troca de período via chip, estado vazio e
 * null → traço (sem NaN na UI).
 */

const mockBack = jest.fn();
const hookCalls: string[] = [];

const mockState = {
  data: undefined as PickerMetricsDTO | undefined,
  isLoading: false,
  isError: false,
};

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

jest.mock("@/api/hooks/usePickerMetrics", () => ({
  usePickerMetrics: (period: string) => {
    hookCalls.push(period);
    return mockState;
  },
}));

function makeMetrics(over: Partial<PickerMetricsDTO> = {}): PickerMetricsDTO {
  return {
    period: "today",
    tasksCompleted: 3,
    itemsPicked: 27,
    itemsPerHour: 18.5,
    substitutionRate: 0.105,
    refusalRate: 0,
    ...over,
  };
}

function render(node: React.ReactElement) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(node);
  });
  return tree!;
}

function screenText(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((t) => {
      const c = t.props.children;
      return Array.isArray(c) ? c.map((x) => String(x)).join("") : String(c);
    })
    .join(" | ");
}

beforeEach(() => {
  mockBack.mockReset();
  hookCalls.length = 0;
  mockState.data = makeMetrics();
  mockState.isLoading = false;
  mockState.isError = false;
});

describe("MetricsScreen (Meu desempenho — story 65)", () => {
  it("renderiza cards de tarefas/itens/itens-hora e as taxas", () => {
    const tree = render(<MetricsScreen />);
    const text = screenText(tree);
    expect(text).toContain("Meu desempenho");
    expect(text).toContain("Tarefas");
    expect(text).toContain("3");
    expect(text).toContain("Itens");
    expect(text).toContain("27");
    expect(text).toContain("18,5"); // itens/hora com vírgula pt-BR
    expect(text).toContain("Taxa de substituição");
    expect(text).toContain("10,5%"); // fração 0.105 → percentual
    expect(text).toContain("Taxa de recusa");
    expect(text).toContain("0,0%");
  });

  it("troca de período pelo chip repassa o período ao hook", () => {
    const tree = render(<MetricsScreen />);
    expect(hookCalls[0]).toBe("today");
    const chip = tree.root.findAllByType(Pressable).find((p) => p.props.testID === "period-30d");
    act(() => chip!.props.onPress());
    expect(hookCalls[hookCalls.length - 1]).toBe("30d");
  });

  it("estado vazio: nenhuma separação no período", () => {
    mockState.data = makeMetrics({
      tasksCompleted: 0,
      itemsPicked: 0,
      itemsPerHour: null,
      substitutionRate: null,
      refusalRate: null,
    });
    const tree = render(<MetricsScreen />);
    expect(screenText(tree)).toContain("Nenhuma separação no período.");
  });

  it("métricas sem dado (null) viram traço — nunca NaN", () => {
    mockState.data = makeMetrics({ itemsPerHour: null, substitutionRate: null, refusalRate: null });
    const tree = render(<MetricsScreen />);
    const text = screenText(tree);
    expect(text).toContain("—");
    expect(text).not.toContain("NaN");
  });

  it("mostra o spinner enquanto carrega", () => {
    mockState.data = undefined;
    mockState.isLoading = true;
    const tree = render(<MetricsScreen />);
    expect(tree.root.findAllByType(ActivityIndicator).length).toBe(1);
  });

  it("mostra erro quando a busca falha", () => {
    mockState.data = undefined;
    mockState.isError = true;
    const tree = render(<MetricsScreen />);
    expect(screenText(tree)).toContain("Erro ao carregar as métricas.");
  });
});
