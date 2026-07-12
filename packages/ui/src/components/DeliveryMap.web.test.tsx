import React from "react";
import renderer, { act } from "react-test-renderer";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DeliveryMap } from "./DeliveryMap.web";
import { webMarkers } from "../test/react-leaflet.mock";

/**
 * Render smoke do mapa de entrega web (Leaflet aliasado p/ mock). Valida os três
 * ícones distintos — loja (vermelho), destino (verde) e móvel (azul) — e que cada
 * um só aparece quando a coordenada existe. Um `document` mínimo cobre o efeito de
 * injeção de estilo (`.leaflet-container`).
 */

const REGION = { latitude: 0, longitude: 0, latitudeDelta: 0.02, longitudeDelta: 0.02 };
const store = { latitude: -25.6, longitude: -49.4 };
const dest = { latitude: -25.5, longitude: -49.3 };
const driver = { latitude: -25.55, longitude: -49.35 };

const originalDocument = (globalThis as { document?: unknown }).document;
const appended: unknown[] = [];

beforeEach(() => {
  webMarkers.length = 0;
  appended.length = 0;
  (globalThis as { document?: unknown }).document = {
    getElementById: () => null,
    createElement: () => ({}),
    head: { appendChild: (el: unknown) => appended.push(el) },
  };
});

afterAll(() => {
  (globalThis as { document?: unknown }).document = originalDocument;
});

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

const at = (p: { latitude: number; longitude: number }) =>
  webMarkers.find((m) => m.position[0] === p.latitude && m.position[1] === p.longitude);

describe("DeliveryMap (web)", () => {
  it("renderiza loja, destino e móvel com ícones distintos e injeta o estilo", () => {
    render({ store, destination: dest, driver });
    expect(webMarkers).toHaveLength(3);
    expect(at(store)?.icon?.__html).toContain("#E11D2A"); // loja vermelha
    expect(at(dest)?.icon?.__html).toContain("#16A34A"); // destino verde
    expect(at(driver)?.icon?.__html).toContain("#2563EB"); // móvel azul
    expect(appended).toHaveLength(1); // efeito de estilo executado
  });

  it("sem marcador móvel: só loja e destino", () => {
    render({ store, destination: dest, driver: null });
    expect(webMarkers).toHaveLength(2);
    expect(webMarkers.find((m) => m.icon?.__html?.includes("#2563EB"))).toBeUndefined();
  });

  it("sem coordenadas: nenhum marcador", () => {
    render({});
    expect(webMarkers).toHaveLength(0);
  });
});
