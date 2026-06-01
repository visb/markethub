import { computeEarnings, haversineMeters } from "./earnings.pricing";

describe("computeEarnings (S4.3)", () => {
  const p = { baseCents: 500, perKmCents: 150, perStopCents: 100 };

  it("base + km + paradas", () => {
    // 2km, 3 paradas → 500 + 150*2 + 100*3 = 1100
    expect(computeEarnings(2000, 3, p)).toBe(1100);
  });

  it("distância zero ainda paga base + paradas", () => {
    expect(computeEarnings(0, 2, p)).toBe(700);
  });

  it("arredonda frações de km", () => {
    // 1500m → 500 + 150*1.5 + 100*1 = 825
    expect(computeEarnings(1500, 1, p)).toBe(825);
  });
});

describe("haversineMeters", () => {
  it("0 entre o mesmo ponto", () => {
    expect(haversineMeters({ lat: -23.5, lng: -46.6 }, { lat: -23.5, lng: -46.6 })).toBe(0);
  });

  it("~1.11km por 0.01° de latitude", () => {
    const d = haversineMeters({ lat: -23.5, lng: -46.6 }, { lat: -23.49, lng: -46.6 });
    expect(d).toBeGreaterThan(1050);
    expect(d).toBeLessThan(1160);
  });
});
