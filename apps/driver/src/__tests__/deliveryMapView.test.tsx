import React from "react";
import renderer, { act } from "react-test-renderer";
import { Linking } from "react-native";
import { Button } from "@markethub/ui";
import type { DeliveryDTO } from "@markethub/api-client";
import { DeliveryMapView, navigationUrl } from "../components/DeliveryMapView";

/**
 * Story 59: mapa da entrega do driver. Mocka o engine de mapa (@markethub/ui
 * DeliveryMap, captura de props), a posição atual (useCurrentLocation) e o
 * Linking. Cobre os marcadores por fase, o botão contextual de navegação, a
 * retirada (sem cliente) e a permissão negada (não quebra).
 */

// react-native-maps não importa fora do Metro (o requireActual do @markethub/ui
// carrega o DeliveryMap nativo).
jest.mock("react-native-maps", () => ({
  __esModule: true,
  default: () => null,
  Marker: () => null,
  PROVIDER_GOOGLE: "google",
}));

const mapProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock("@markethub/ui", () => {
  const actual = jest.requireActual("@markethub/ui");
  return {
    __esModule: true,
    ...actual,
    DeliveryMap: (props: Record<string, unknown>) => {
      mapProps.current = props;
      return null;
    },
  };
});

const mockLocation = {
  current: { position: null as { latitude: number; longitude: number } | null, permissionDenied: false },
};
jest.mock("@/hooks/useCurrentLocation", () => ({
  useCurrentLocation: () => mockLocation.current,
}));

const STORE = { latitude: -25.43, longitude: -49.27 };
const CUSTOMER = { latitude: -25.5, longitude: -49.3 };
const ME = { latitude: -25.46, longitude: -49.28 };

function mkDelivery(over: Partial<DeliveryDTO>): DeliveryDTO {
  return {
    id: "d1",
    orderGroupId: "g1",
    orderId: "order-1",
    status: "assigned",
    storeId: "s1",
    storeName: "Loja",
    storeLat: STORE.latitude,
    storeLng: STORE.longitude,
    customerName: "Cliente",
    destLat: CUSTOMER.latitude,
    destLng: CUSTOMER.longitude,
    itemCount: 2,
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

beforeEach(() => {
  mapProps.current = null;
  mockLocation.current = { position: ME, permissionDenied: false };
  jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("navigationUrl", () => {
  it("monta o deep-link universal do Google Maps com o destino", () => {
    expect(navigationUrl(CUSTOMER)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=-25.5,-49.3",
    );
  });
});

describe("DeliveryMapView", () => {
  it("fase de coleta (assigned): mapa com loja, cliente e posição; navega até a loja", () => {
    const tree = render(<DeliveryMapView delivery={mkDelivery({ status: "assigned" })} />);
    expect(mapProps.current?.store).toEqual(STORE);
    expect(mapProps.current?.destination).toEqual(CUSTOMER);
    expect(mapProps.current?.driver).toEqual(ME);

    const btn = tree.root.findAllByType(Button).find((b) => b.props.title === "Navegar até a loja");
    expect(btn).toBeDefined();
    act(() => btn!.props.onPress());
    expect(Linking.openURL).toHaveBeenCalledWith(navigationUrl(STORE));
  });

  it("fase de entrega (picked_up): botão navega até o cliente", () => {
    const tree = render(<DeliveryMapView delivery={mkDelivery({ status: "picked_up" })} />);
    const btn = tree.root.findAllByType(Button).find((b) => b.props.title === "Navegar até o cliente");
    expect(btn).toBeDefined();
    act(() => btn!.props.onPress());
    expect(Linking.openURL).toHaveBeenCalledWith(navigationUrl(CUSTOMER));
  });

  it("permissão negada (posição null): mapa segue sem o marcador de posição e mostra o aviso", () => {
    mockLocation.current = { position: null, permissionDenied: true };
    const tree = render(<DeliveryMapView delivery={mkDelivery({ status: "assigned" })} />);
    expect(mapProps.current?.driver).toBeNull();
    expect(mapProps.current?.store).toEqual(STORE);
    expect(JSON.stringify(tree.toJSON())).toContain("Ative a localização");
  });

  it("retirada (sem endereço de entrega): só loja, sem botão de cliente", () => {
    const tree = render(
      <DeliveryMapView delivery={mkDelivery({ status: "picked_up", destLat: null, destLng: null })} />,
    );
    expect(mapProps.current?.destination).toBeNull();
    expect(mapProps.current?.store).toEqual(STORE);
    const btn = tree.root
      .findAllByType(Button)
      .find((b) => b.props.title === "Navegar até o cliente");
    expect(btn).toBeUndefined();
  });

  it("entregue: não renderiza o mapa", () => {
    const tree = render(<DeliveryMapView delivery={mkDelivery({ status: "delivered" })} />);
    expect(tree.toJSON()).toBeNull();
    expect(mapProps.current).toBeNull();
  });

  it("sem nenhuma coordenada: não renderiza o mapa", () => {
    mockLocation.current = { position: null, permissionDenied: false };
    const tree = render(
      <DeliveryMapView
        delivery={mkDelivery({ status: "assigned", storeLat: null, storeLng: null, destLat: null, destLng: null })}
      />,
    );
    expect(tree.toJSON()).toBeNull();
  });
});
