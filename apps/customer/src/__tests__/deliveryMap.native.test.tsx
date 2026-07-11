import React from "react";
import renderer, { act } from "react-test-renderer";
import { DeliveryMap } from "../components/DeliveryMap";

/**
 * Story 51: mapa nativo do rastreio ao vivo (react-native-maps mockado). Valida
 * que loja, destino e entregador viram Markers com as coordenadas certas, via a
 * interface abstrata `DeliveryMap` — sem o engine real.
 */

const markerProps: Array<Record<string, unknown>> = [];

jest.mock("react-native-maps", () => {
  const React = jest.requireActual("react");
  return {
    __esModule: true,
    PROVIDER_GOOGLE: "google",
    default: ({ children }: { children: React.ReactNode }) =>
      React.createElement("MapView", null, children),
    Marker: (props: Record<string, unknown>) => {
      markerProps.push(props);
      return null;
    },
  };
});

const REGION = { latitude: 0, longitude: 0, latitudeDelta: 0.08, longitudeDelta: 0.08 };
const store = { latitude: -25.6, longitude: -49.4 };
const dest = { latitude: -25.5, longitude: -49.3 };
const driver = { latitude: -25.55, longitude: -49.35 };

beforeEach(() => {
  markerProps.length = 0;
});

describe("DeliveryMap (nativo)", () => {
  it("renderiza loja, destino e entregador com as coordenadas certas", () => {
    act(() => {
      renderer.create(
        <DeliveryMap initialRegion={REGION} store={store} destination={dest} driver={driver} />,
      );
    });
    expect(markerProps.find((m) => m.title === "Loja")?.coordinate).toEqual(store);
    expect(markerProps.find((m) => m.title === "Entrega")?.coordinate).toEqual(dest);
    expect(markerProps.find((m) => m.title === "Entregador")?.coordinate).toEqual(driver);
  });

  it("sem entregador: não renderiza o marcador do entregador", () => {
    act(() => {
      renderer.create(
        <DeliveryMap initialRegion={REGION} store={store} destination={dest} driver={null} />,
      );
    });
    expect(markerProps.find((m) => m.title === "Entregador")).toBeUndefined();
  });

  it("sem coordenadas: nenhum marcador", () => {
    act(() => {
      renderer.create(
        <DeliveryMap initialRegion={REGION} store={null} destination={null} driver={null} />,
      );
    });
    expect(markerProps).toHaveLength(0);
  });
});
