import React from "react";
import renderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it } from "vitest";
import { DeliveryMap } from "./DeliveryMap";
import { nativeMarkers } from "../test/react-native-maps.mock";

/**
 * Render smoke do mapa de entrega nativo (react-native-maps aliasado p/ mock).
 * Valida que loja, destino e marcador móvel viram Markers com as coordenadas
 * certas, e que cada um só aparece quando a coordenada existe.
 */

const REGION = { latitude: 0, longitude: 0, latitudeDelta: 0.02, longitudeDelta: 0.02 };
const store = { latitude: -25.6, longitude: -49.4 };
const dest = { latitude: -25.5, longitude: -49.3 };
const driver = { latitude: -25.55, longitude: -49.35 };

beforeEach(() => {
  nativeMarkers.length = 0;
});

describe("DeliveryMap (nativo)", () => {
  it("renderiza loja, destino e marcador móvel com as coordenadas certas", () => {
    act(() => {
      renderer.create(
        <DeliveryMap initialRegion={REGION} store={store} destination={dest} driver={driver} />,
      );
    });
    expect(nativeMarkers.find((m) => m.title === "Loja")?.coordinate).toEqual(store);
    expect(nativeMarkers.find((m) => m.title === "Entrega")?.coordinate).toEqual(dest);
    expect(nativeMarkers.find((m) => m.title === "Entregador")?.coordinate).toEqual(driver);
  });

  it("sem marcador móvel: não renderiza o pino azul", () => {
    act(() => {
      renderer.create(
        <DeliveryMap initialRegion={REGION} store={store} destination={dest} driver={null} />,
      );
    });
    expect(nativeMarkers.find((m) => m.title === "Entregador")).toBeUndefined();
    expect(nativeMarkers).toHaveLength(2);
  });

  it("sem coordenadas: nenhum marcador", () => {
    act(() => {
      renderer.create(
        <DeliveryMap initialRegion={REGION} store={null} destination={null} driver={null} />,
      );
    });
    expect(nativeMarkers).toHaveLength(0);
  });
});
