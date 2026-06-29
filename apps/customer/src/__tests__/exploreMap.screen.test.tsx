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

  it("renderiza o marker 'você está aqui' quando há endereço ativo (story 30)", () => {
    act(() => {
      renderer.create(
        <StoreMap
          initialRegion={{ latitude: 0, longitude: 0, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
          stores={[]}
          destination={{ latitude: -25.5, longitude: -49.3 }}
        />,
      );
    });
    const dest = markerProps.find((m) => m.title === "Você está aqui");
    expect(dest?.coordinate).toEqual({ latitude: -25.5, longitude: -49.3 });
  });

  it("sem destino → nenhum marker do usuário", () => {
    act(() => {
      renderer.create(
        <StoreMap
          initialRegion={{ latitude: 0, longitude: 0, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
          stores={[STORE]}
          destination={null}
        />,
      );
    });
    expect(markerProps.find((m) => m.title === "Você está aqui")).toBeUndefined();
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
    // useEffect (fetch inline) segue proibido; useState p/ seleção de marker é UI local (story 29).
    expect(screen).not.toMatch(/useEffect/);
  });

  it("consome o ViewModel useExploreMap e o StoreMap", () => {
    expect(screen).toMatch(/useExploreMap/);
    expect(screen).toMatch(/StoreMap/);
  });

  it("renderiza a AddressBar com o endereço ativo e navega para /delivery (story 30)", () => {
    expect(screen).toMatch(/AddressBar/);
    expect(screen).toMatch(/activeAddress/);
    expect(screen).toMatch(/router\.push\("\/delivery"\)/);
  });

  it("encaminha onViewportChange ao mapa e renderiza o overlay de loading (story 06)", () => {
    expect(screen).toMatch(/onViewportChange/);
    expect(screen).toMatch(/MapLoadingBadge/);
    expect(screen).toMatch(/fetching/);
  });

  it("tocar no marker abre o modal (não navega direto para /store) — story 29", () => {
    // onStorePress agora guarda a seleção (abre o sheet) em vez de router.push para a loja.
    expect(screen).toMatch(/onStorePress=\{\(s\) => setSelectedStoreId\(s\.id\)\}/);
    expect(screen).toMatch(/StoreSummarySheet/);
    expect(screen).toMatch(/selectedStoreId/);
    // a navegação direta para /store/ não acontece mais no callback do marker
    expect(screen).not.toMatch(/onStorePress=\{\(s\) => router\.push/);
  });
});
