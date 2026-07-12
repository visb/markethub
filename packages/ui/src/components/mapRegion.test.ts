import { describe, expect, it } from "vitest";
import { DEFAULT_DELTA, fitRegion, hasCoords } from "./mapRegion";

describe("hasCoords", () => {
  it("verdadeiro só com lat/lng finitos", () => {
    expect(hasCoords({ latitude: -25, longitude: -49 })).toBe(true);
    expect(hasCoords({ latitude: null, longitude: -49 })).toBe(false);
    expect(hasCoords({ latitude: -25, longitude: undefined })).toBe(false);
    expect(hasCoords({ latitude: Number.NaN, longitude: -49 })).toBe(false);
  });
});

describe("fitRegion", () => {
  it("null quando não há ponto válido", () => {
    expect(fitRegion([])).toBeNull();
    expect(fitRegion([null, undefined])).toBeNull();
    expect(fitRegion([{ latitude: null as unknown as number, longitude: -49 }])).toBeNull();
  });

  it("um ponto: centraliza com o zoom mínimo", () => {
    const r = fitRegion([{ latitude: -25.4, longitude: -49.2 }]);
    expect(r).not.toBeNull();
    expect(r!.latitude).toBeCloseTo(-25.4);
    expect(r!.longitude).toBeCloseTo(-49.2);
    expect(r!.latitudeDelta).toBe(DEFAULT_DELTA.latitudeDelta);
    expect(r!.longitudeDelta).toBe(DEFAULT_DELTA.longitudeDelta);
  });

  it("dois pontos: centro no meio e deltas com folga", () => {
    const r = fitRegion(
      [
        { latitude: -25.0, longitude: -49.0 },
        { latitude: -26.0, longitude: -50.0 },
      ],
      1.6,
    );
    expect(r!.latitude).toBeCloseTo(-25.5);
    expect(r!.longitude).toBeCloseTo(-49.5);
    expect(r!.latitudeDelta).toBeCloseTo(1.6); // (26-25) * 1.6
    expect(r!.longitudeDelta).toBeCloseTo(1.6);
  });

  it("ignora pontos nulos entre válidos", () => {
    const r = fitRegion([{ latitude: -25, longitude: -49 }, null, { latitude: -25, longitude: -49 }]);
    expect(r).not.toBeNull();
    expect(r!.latitudeDelta).toBe(DEFAULT_DELTA.latitudeDelta);
  });
});
