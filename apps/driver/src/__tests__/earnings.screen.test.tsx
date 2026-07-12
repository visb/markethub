import React from "react";
import renderer, { act } from "react-test-renderer";
import { ActivityIndicator, Pressable } from "react-native";
import { Button, Text } from "@markethub/ui";
import type { DeliveryHistoryItemDTO, DriverEarningsDTO } from "@markethub/api-client";
import EarningsScreen from "../../app/earnings";

/**
 * Story 60: tela de ganhos (gorjetas) e histórico do entregador. Mocka os hooks de
 * dados (React Query) e o expo-router. Cobre render de cards + lista, troca de
 * período (refaz a query), paginação (carregar mais) e o estado vazio.
 */

const mockBack = jest.fn();
const mockLoadMore = jest.fn();
const mockUseEarnings = jest.fn();
const mockUseHistory = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock("@/api/hooks/useDriverEarnings", () => ({
  useDriverEarnings: (...a: unknown[]) => mockUseEarnings(...a),
  useDeliveryHistory: () => mockUseHistory(),
}));

const earnings: DriverEarningsDTO = {
  period: "today",
  tipsPaidCents: 1500,
  tipsPaidCount: 3,
  tipsPendingCents: 200,
  deliveriesCompleted: 4,
};

function historyItem(over: Partial<DeliveryHistoryItemDTO> = {}): DeliveryHistoryItemDTO {
  return {
    id: "d1",
    orderId: "order-000123",
    status: "delivered",
    storeName: "Loja 1",
    destinationArea: "Centro, Sampa",
    date: "2026-07-10T10:00:00.000Z",
    tip: { amountCents: 500, status: "paid" },
    ...over,
  };
}

function setEarnings(over: Partial<ReturnType<typeof mockUseEarnings>> = {}) {
  mockUseEarnings.mockReturnValue({ data: earnings, isLoading: false, isError: false, ...over });
}

function setHistory(over: Record<string, unknown> = {}) {
  mockUseHistory.mockReturnValue({
    items: [historyItem()],
    isLoading: false,
    isError: false,
    hasMore: false,
    isLoadingMore: false,
    loadMore: mockLoadMore,
    ...over,
  });
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
  mockLoadMore.mockReset();
  mockUseEarnings.mockReset();
  mockUseHistory.mockReset();
  setEarnings();
  setHistory();
});

describe("EarningsScreen", () => {
  it("renderiza os cards de resumo e a lista do histórico", () => {
    const tree = render(<EarningsScreen />);
    const text = screenText(tree);
    expect(text).toContain("Gorjetas recebidas");
    expect(text).toContain("Entregas");
    expect(text).toContain("000123");
    expect(text).toContain("Centro, Sampa");
    expect(text).toContain("Entregue");
  });

  it("mostra as gorjetas pendentes de forma discreta", () => {
    const tree = render(<EarningsScreen />);
    expect(screenText(tree)).toContain("pendente");
  });

  it("troca de período refaz a query com o novo período", () => {
    const tree = render(<EarningsScreen />);
    // começa em today
    expect(mockUseEarnings).toHaveBeenLastCalledWith("today");
    const chip30 = tree.root.findByProps({ testID: "period-30d" });
    act(() => chip30.props.onPress());
    expect(mockUseEarnings).toHaveBeenLastCalledWith("30d");
  });

  it("botão carregar mais chama loadMore quando há mais páginas", () => {
    setHistory({ hasMore: true });
    const tree = render(<EarningsScreen />);
    const btn = tree.root.findAllByType(Button).find((b) => b.props.title === "Carregar mais");
    act(() => btn!.props.onPress());
    expect(mockLoadMore).toHaveBeenCalled();
  });

  it("estado vazio: sem entregas concluídas", () => {
    setHistory({ items: [] });
    const tree = render(<EarningsScreen />);
    expect(screenText(tree)).toContain("Você ainda não concluiu nenhuma entrega.");
  });

  it("estado de carregamento dos ganhos mostra spinner", () => {
    setEarnings({ data: undefined, isLoading: true });
    const tree = render(<EarningsScreen />);
    expect(tree.root.findAllByType(ActivityIndicator).length).toBeGreaterThanOrEqual(1);
  });

  it("erro ao carregar os ganhos", () => {
    setEarnings({ data: undefined, isError: true });
    const tree = render(<EarningsScreen />);
    expect(screenText(tree)).toContain("Erro ao carregar os ganhos.");
  });

  it("erro ao carregar o histórico", () => {
    setHistory({ items: [], isError: true });
    const tree = render(<EarningsScreen />);
    expect(screenText(tree)).toContain("Erro ao carregar o histórico.");
  });

  it("botão voltar navega para trás", () => {
    const tree = render(<EarningsScreen />);
    const voltar = tree.root.findAllByType(Button).find((b) => b.props.title === "Voltar");
    act(() => voltar!.props.onPress());
    expect(mockBack).toHaveBeenCalled();
  });

  it("entrega cancelada aparece com rótulo Cancelada", () => {
    setHistory({ items: [historyItem({ status: "canceled", tip: undefined })] });
    const tree = render(<EarningsScreen />);
    expect(screenText(tree)).toContain("Cancelada");
  });

  it("histórico carregando mostra spinner", () => {
    setHistory({ items: [], isLoading: true });
    const tree = render(<EarningsScreen />);
    expect(tree.root.findAllByType(ActivityIndicator).length).toBeGreaterThanOrEqual(1);
  });
});
