import React from "react";
import renderer, { act } from "react-test-renderer";
import ExploreScreen from "../../app/explore";
import type { Address } from "../api/marketplace";

/**
 * Story 30: render da tela Explorar focado na barra de endereço. Mocka o ViewModel
 * (`useExploreMap`) e os filhos pesados (mapa, tabs, FAB) para isolar a `AddressBar`:
 * com endereço ativo a barra reflete o estado do ViewModel e tocar nela navega
 * para `/delivery`; sem endereço, mostra o CTA "Definir endereço".
 */

const mockUseExploreMap = jest.fn();
jest.mock("../api/hooks/useExploreMap", () => ({
  useExploreMap: () => mockUseExploreMap(),
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock("../use-cart", () => ({ useCart: () => ({ total: 0 }) }));

// Filhos pesados → stubs (o foco é a AddressBar).
jest.mock("../components/MapView", () => ({ StoreMap: () => null }));
jest.mock("../components/MapLoadingBadge", () => ({ MapLoadingBadge: () => null }));
jest.mock("../components/StoreSummarySheet", () => ({ StoreSummarySheet: () => null }));
jest.mock("../components/CartFab", () => ({ CartFab: () => null }));
jest.mock("../components/BottomTabs", () => ({ BottomTabs: () => null }));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

function addr(over: Partial<Address> = {}): Address {
  return {
    id: "a1", label: "Casa", street: "Rua das Flores", number: "123", district: "Centro",
    city: "Curitiba", state: "PR", zipCode: "80000-000",
    latitude: -25.5, longitude: -49.3, isDefault: true, ...over,
  };
}

function baseVm(over: Record<string, unknown> = {}) {
  return {
    ready: true,
    initialRegion: { latitude: 0, longitude: 0, latitudeDelta: 0.08, longitudeDelta: 0.08 },
    stores: [],
    destination: null,
    activeAddress: null,
    onViewportChange: jest.fn(),
    fetching: false,
    loading: false,
    ...over,
  };
}

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<ExploreScreen />);
  });
  return tree;
}

beforeEach(() => {
  mockUseExploreMap.mockReset();
  mockPush.mockReset();
});

describe("ExploreScreen — barra de endereço (story 30)", () => {
  it("com endereço ativo a barra reflete o endereço do ViewModel", () => {
    mockUseExploreMap.mockReturnValue(baseVm({ activeAddress: addr() }));
    const t = JSON.stringify(render().toJSON());
    expect(t).toContain("Minha localização atual");
    expect(t).toContain("Rua das Flores, 123");
  });

  it("sem endereço ativo a barra mostra o CTA 'Definir endereço'", () => {
    mockUseExploreMap.mockReturnValue(baseVm({ activeAddress: null }));
    const t = JSON.stringify(render().toJSON());
    expect(t).toContain("Definir endereço");
  });

  it("tocar a barra navega para /delivery", () => {
    mockUseExploreMap.mockReturnValue(baseVm({ activeAddress: addr() }));
    const tree = render();
    const bar = tree.root.findAll((n) => n.props.accessibilityRole === "button")[0];
    act(() => {
      bar.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith("/delivery");
  });
});
