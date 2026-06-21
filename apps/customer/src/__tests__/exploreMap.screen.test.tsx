import React from "react";
import renderer, { act } from "react-test-renderer";
import { StoreMap } from "../components/MapView";
import type { NearbyStoreDTO } from "../api/marketplace";

/**
 * Story 05: mapa nativo (react-native-maps mockado). Valida que os marcadores
 * recebem as coordenadas certas — via a interface abstrata `StoreMap`, sem o
 * engine real. A tela `explore` é checada no nível de fonte (orquestra o hook).
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

const STORE: NearbyStoreDTO = {
  id: "st1", name: "Mercado", latitude: -25.6, longitude: -49.4,
  city: "Curitiba", state: "PR", avgPrepMinutes: 30, merchantName: "Rede", merchantLogoUrl: null,
};

beforeEach(() => { markerProps.length = 0; });

describe("StoreMap (nativo)", () => {
  it("renderiza um Marker por mercado com a coordenada correta", () => {
    act(() => {
      renderer.create(
        <StoreMap
          initialRegion={{ latitude: 0, longitude: 0, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
          stores={[STORE]}
          destination={null}
        />,
      );
    });
    const storeMarker = markerProps.find((m) => m.title === "Mercado");
    expect(storeMarker?.coordinate).toEqual({ latitude: -25.6, longitude: -49.4 });
  });

  it("renderiza o pin de destino quando há endereço ativo", () => {
    act(() => {
      renderer.create(
        <StoreMap
          initialRegion={{ latitude: 0, longitude: 0, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
          stores={[]}
          destination={{ latitude: -25.5, longitude: -49.3 }}
        />,
      );
    });
    const dest = markerProps.find((m) => m.title === "Endereço de entrega");
    expect(dest?.coordinate).toEqual({ latitude: -25.5, longitude: -49.3 });
  });

  it("sem destino → nenhum pin de endereço", () => {
    act(() => {
      renderer.create(
        <StoreMap
          initialRegion={{ latitude: 0, longitude: 0, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
          stores={[STORE]}
          destination={null}
        />,
      );
    });
    expect(markerProps.find((m) => m.title === "Endereço de entrega")).toBeUndefined();
  });
});

describe("tela explore — orquestra o hook (não faz fetch inline)", () => {
  const nodeRequire = (eval("require") as (id: string) => unknown) as (
    id: string,
  ) => { readFileSync: (p: string, enc: string) => string };
  const cwd = (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? ".";
  const fsMod = nodeRequire("fs");
  const screen = fsMod.readFileSync(`${cwd}/app/explore.tsx`, "utf8");

  it("não importa React Query nem faz fetch inline", () => {
    expect(screen).not.toMatch(/@tanstack\/react-query/);
    expect(screen).not.toMatch(/useQuery|useMutation/);
    expect(screen).not.toMatch(/useState|useEffect/);
  });

  it("consome o ViewModel useExploreMap e o StoreMap", () => {
    expect(screen).toMatch(/useExploreMap/);
    expect(screen).toMatch(/StoreMap/);
  });
});
