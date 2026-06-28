import React from "react";
import renderer, { act } from "react-test-renderer";
import { StoreMap } from "../components/MapView.web";
import type { NearbyStoreDTO } from "../api/marketplace";

/**
 * Story 30: mapa web (Leaflet mockado). Valida que o marker de `destination` usa o
 * ícone "você está aqui" (dot azul #2563EB), distinto do pino vermelho de loja, e
 * que sem `destination` nenhum marker do usuário é renderizado.
 */

type MarkerProps = { position: [number, number]; icon?: { __html?: string } };
const markers: MarkerProps[] = [];

jest.mock("leaflet/dist/leaflet.css", () => ({}), { virtual: true });

jest.mock("leaflet", () => ({
  __esModule: true,
  default: {
    // Echo do html → permite inspecionar o estilo do ícone no teste.
    divIcon: (opts: { html: string }) => ({ __html: opts.html }),
  },
}));

jest.mock("react-leaflet", () => {
  const React = jest.requireActual("react");
  return {
    __esModule: true,
    MapContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement("MapContainer", null, children),
    TileLayer: () => null,
    Popup: ({ children }: { children: React.ReactNode }) =>
      React.createElement("Popup", null, children),
    Marker: (props: MarkerProps & { children?: React.ReactNode }) => {
      markers.push({ position: props.position, icon: props.icon });
      return React.createElement("Marker", null, props.children);
    },
    useMapEvents: () => null,
  };
});

const STORE: NearbyStoreDTO = {
  id: "st1", name: "Mercado", latitude: -25.6, longitude: -49.4,
  city: "Curitiba", state: "PR", avgPrepMinutes: 30, merchantName: "Rede", merchantLogoUrl: null,
};

const REGION = { latitude: 0, longitude: 0, latitudeDelta: 0.08, longitudeDelta: 0.08 };

function render(destination: { latitude: number; longitude: number } | null, stores = [STORE]) {
  act(() => {
    renderer.create(
      <StoreMap initialRegion={REGION} stores={stores} destination={destination} />,
    );
  });
}

beforeEach(() => {
  markers.length = 0;
});

describe("StoreMap (web) — marker 'você está aqui' (story 30)", () => {
  it("usa o ícone azul distinto no marker de destino", () => {
    render({ latitude: -25.5, longitude: -49.3 });
    const userMarker = markers.find(
      (m) => m.position[0] === -25.5 && m.position[1] === -49.3,
    );
    expect(userMarker).toBeDefined();
    expect(userMarker?.icon?.__html).toContain("#2563EB");
    // distinto do pino de loja (vermelho)
    expect(userMarker?.icon?.__html).not.toContain("#E11D2A");
  });

  it("o marker de loja continua usando o pino vermelho", () => {
    render({ latitude: -25.5, longitude: -49.3 });
    const storeMarker = markers.find(
      (m) => m.position[0] === STORE.latitude && m.position[1] === STORE.longitude,
    );
    expect(storeMarker?.icon?.__html).toContain("#E11D2A");
    expect(storeMarker?.icon?.__html).not.toContain("#2563EB");
  });

  it("sem destino → nenhum marker do usuário", () => {
    render(null);
    const userMarker = markers.find((m) => m.icon?.__html?.includes("#2563EB"));
    expect(userMarker).toBeUndefined();
  });
});
