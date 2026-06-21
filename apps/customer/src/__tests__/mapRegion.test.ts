import {
  DEFAULT_CENTER,
  hasCoords,
  regionToBounds,
  resolveInitialRegion,
  selectActiveAddress,
} from "../lib/mapRegion";
import type { Address } from "../api/marketplace";

/**
 * Story 05: lógica pura de resolução de região/bounds/endereço ativo, isolada do
 * engine de mapa (testável sem react-native-maps/Leaflet — decisão da story).
 */

function addr(over: Partial<Address> = {}): Address {
  return {
    id: "a1",
    label: "Casa",
    street: "Rua A",
    number: "10",
    district: null,
    city: "Curitiba",
    state: "PR",
    zipCode: "80000-000",
    latitude: -25.5,
    longitude: -49.3,
    isDefault: false,
    ...over,
  };
}

describe("selectActiveAddress", () => {
  it("escolhe o isDefault quando existe", () => {
    const a = addr({ id: "a1" });
    const b = addr({ id: "a2", isDefault: true });
    expect(selectActiveAddress([a, b])?.id).toBe("a2");
  });

  it("cai no [0] quando não há default", () => {
    const a = addr({ id: "a1" });
    const b = addr({ id: "a2" });
    expect(selectActiveAddress([a, b])?.id).toBe("a1");
  });

  it("lista vazia → null", () => {
    expect(selectActiveAddress([])).toBeNull();
  });
});

describe("hasCoords", () => {
  it("true para lat/lng finitos", () => {
    expect(hasCoords({ latitude: -25, longitude: -49 })).toBe(true);
  });
  it("false quando algum é null/undefined", () => {
    expect(hasCoords({ latitude: null, longitude: -49 })).toBe(false);
    expect(hasCoords({ latitude: -25, longitude: undefined })).toBe(false);
  });
});

describe("resolveInitialRegion", () => {
  it("prioriza o GPS quando disponível", () => {
    const r = resolveInitialRegion({
      gps: { latitude: -10, longitude: -20 },
      activeAddress: addr({ latitude: -25.5, longitude: -49.3 }),
    });
    expect(r.latitude).toBe(-10);
    expect(r.longitude).toBe(-20);
  });

  it("GPS negado → usa o endereço ativo (com lat/lng)", () => {
    const r = resolveInitialRegion({
      gps: null,
      activeAddress: addr({ latitude: -25.5, longitude: -49.3 }),
    });
    expect(r.latitude).toBe(-25.5);
    expect(r.longitude).toBe(-49.3);
  });

  it("sem GPS e sem endereço → centro padrão", () => {
    const r = resolveInitialRegion({ gps: null, activeAddress: null });
    expect(r.latitude).toBe(DEFAULT_CENTER.latitude);
    expect(r.longitude).toBe(DEFAULT_CENTER.longitude);
  });

  it("endereço sem lat/lng não vira centro → cai no padrão", () => {
    const r = resolveInitialRegion({
      gps: null,
      activeAddress: addr({ latitude: null, longitude: null }),
    });
    expect(r.latitude).toBe(DEFAULT_CENTER.latitude);
  });

  it("sempre inclui deltas de zoom", () => {
    const r = resolveInitialRegion({ gps: { latitude: 1, longitude: 2 }, activeAddress: null });
    expect(r.latitudeDelta).toBeGreaterThan(0);
    expect(r.longitudeDelta).toBeGreaterThan(0);
  });
});

describe("regionToBounds", () => {
  it("deriva a bounding box do centro + deltas (half-delta por borda)", () => {
    const bounds = regionToBounds({
      latitude: 0,
      longitude: 0,
      latitudeDelta: 0.1,
      longitudeDelta: 0.2,
    });
    expect(bounds.north).toBeCloseTo(0.05);
    expect(bounds.south).toBeCloseTo(-0.05);
    expect(bounds.east).toBeCloseTo(0.1);
    expect(bounds.west).toBeCloseTo(-0.1);
  });

  it("north ≥ south e east ≥ west (válido p/ o endpoint)", () => {
    const bounds = regionToBounds(resolveInitialRegion({ gps: null, activeAddress: null }));
    expect(bounds.north).toBeGreaterThan(bounds.south);
    expect(bounds.east).toBeGreaterThan(bounds.west);
  });
});
