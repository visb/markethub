import React from "react";
import renderer, { act } from "react-test-renderer";
import { StoreSummarySheet, freightLabel } from "../components/StoreSummarySheet";
import type { StoreSummaryDTO } from "../api/marketplace";

/**
 * Story 29: bottom sheet do resumo da loja. Mocka useStoreSummary (estado de
 * carga/dados) e expo-router (navegação do CTA). Valida spinner no load, render
 * dos campos/badges/faixa de frete e o "Acessar loja" → /store/:id.
 */

const mockUseStoreSummary = jest.fn();
jest.mock("../api/hooks/useStoreSummary", () => ({
  useStoreSummary: (...a: unknown[]) => mockUseStoreSummary(...a),
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

// Ícones: stub leve (evita carregar fontes nativas no jest).
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

const SUMMARY: StoreSummaryDTO = {
  id: "st1",
  name: "Loja Um - Centro",
  merchantName: "Rede X",
  merchantLogoUrl: null,
  address: { street: "Rua A", number: "10", district: "Centro", city: "Curitiba", state: "PR" },
  phone: "(41) 3000-0000",
  rating: { average: 4.5, count: 12 },
  etaMinutes: 30,
  deliveryFeeCents: 700,
  doorFeeCents: 1100,
  allowsPickup: true,
  openNow: true,
};

/** Coleta todas as strings renderadas na árvore (para asserts de conteúdo). */
function texts(tree: renderer.ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

function render(storeId: string | null) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<StoreSummarySheet storeId={storeId} onClose={jest.fn()} />);
  });
  return tree;
}

beforeEach(() => {
  mockUseStoreSummary.mockReset();
  mockPush.mockReset();
});

describe("freightLabel", () => {
  it("faixa quando piso ≠ teto", () => {
    expect(freightLabel(700, 1100)).toBe("R$ 7,00 – R$ 11,00");
  });
  it("valor único quando piso = teto", () => {
    expect(freightLabel(700, 700)).toBe("R$ 7,00");
  });
});

describe("StoreSummarySheet", () => {
  it("mostra spinner enquanto carrega", () => {
    mockUseStoreSummary.mockReturnValue({ summary: null, loading: true });
    const tree = render("st1");
    expect(tree.root.findAllByType(require("react-native").ActivityIndicator).length).toBe(1);
  });

  it("renderiza nome, endereço, rating, ETA, faixa de frete e badges", () => {
    mockUseStoreSummary.mockReturnValue({ summary: SUMMARY, loading: false });
    const t = texts(render("st1"));
    expect(t).toContain("Loja Um - Centro");
    expect(t).toContain("Rua A, 10");
    expect(t).toContain("4.5");
    expect(t).toContain("30 min ou programada");
    expect(t).toContain("R$ 7,00 – R$ 11,00");
    expect(t).toContain("Aberto agora");
    expect(t).toContain("Retirar na loja");
    expect(t).toContain("Acessar loja");
  });

  it("faixa de frete vira valor único quando piso = teto", () => {
    mockUseStoreSummary.mockReturnValue({
      summary: { ...SUMMARY, deliveryFeeCents: 700, doorFeeCents: 700 },
      loading: false,
    });
    const t = texts(render("st1"));
    expect(t).toContain("R$ 7,00");
    expect(t).not.toContain("R$ 7,00 –");
  });

  it("badge 'Retirar na loja' só com allowsPickup", () => {
    mockUseStoreSummary.mockReturnValue({
      summary: { ...SUMMARY, allowsPickup: false },
      loading: false,
    });
    const t = texts(render("st1"));
    expect(t).not.toContain("Retirar na loja");
  });

  it("badge 'Fechado' quando openNow false", () => {
    mockUseStoreSummary.mockReturnValue({
      summary: { ...SUMMARY, openNow: false },
      loading: false,
    });
    const t = texts(render("st1"));
    expect(t).toContain("Fechado");
    expect(t).not.toContain("Aberto agora");
  });

  it("'Acessar loja' navega para /store/:id", () => {
    mockUseStoreSummary.mockReturnValue({ summary: SUMMARY, loading: false });
    const tree = render("st1");
    const btn = tree.root.findAll(
      (n) => n.props.accessibilityRole === "button" && n.props.disabled !== true,
    )[0];
    act(() => {
      btn.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith("/store/st1?name=Rede%20X");
  });
});
