import React from "react";
import renderer, { act } from "react-test-renderer";
import { DeliveryMap } from "../components/DeliveryMap.web";

/**
 * Story 51: mapa web do rastreio ao vivo (Leaflet mockado). Valida os três
 * marcadores — loja (vermelho), destino (verde) e entregador (azul) — e que cada
 * um só aparece quando a coordenada existe.
 */

type MarkerProps = { position: [number, number]; icon?: { __html?: string } };
const markers: MarkerProps[] = [];

jest.mock("leaflet/dist/leaflet.css", () => ({}), { virtual: true });

jest.mock("leaflet", () => ({
  __esModule: true,
  default: {
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
  };
});

const REGION = { latitude: 0, longitude: 0, latitudeDelta: 0.08, longitudeDelta: 0.08 };
const store = { latitude: -25.6, longitude: -49.4 };
const dest = { latitude: -25.5, longitude: -49.3 };
const driver = { latitude: -25.55, longitude: -49.35 };

function render(props: Partial<React.ComponentProps<typeof DeliveryMap>>) {
  act(() => {
    renderer.create(
      <DeliveryMap
        initialRegion={REGION}
        store={props.store ?? null}
        destination={props.destination ?? null}
        driver={props.driver ?? null}
      />,
    );
  });
}

beforeEach(() => {
  markers.length = 0;
});

describe("DeliveryMap (web)", () => {
  it("renderiza loja, destino e entregador com ícones distintos", () => {
    render({ store, destination: dest, driver });
    expect(markers).toHaveLength(3);
    const at = (p: { latitude: number; longitude: number }) =>
      markers.find((m) => m.position[0] === p.latitude && m.position[1] === p.longitude);
    expect(at(store)?.icon?.__html).toContain("#E11D2A"); // loja vermelha
    expect(at(dest)?.icon?.__html).toContain("#16A34A"); // destino verde
    expect(at(driver)?.icon?.__html).toContain("#2563EB"); // entregador azul
  });

  it("sem entregador: só loja e destino são renderizados", () => {
    render({ store, destination: dest, driver: null });
    expect(markers).toHaveLength(2);
    expect(markers.find((m) => m.icon?.__html?.includes("#2563EB"))).toBeUndefined();
  });

  it("sem coordenadas: nenhum marcador", () => {
    render({});
    expect(markers).toHaveLength(0);
  });
});
