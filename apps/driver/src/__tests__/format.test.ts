import { brl, distance, secondsUntil } from "@/format";

describe("format helpers", () => {
  it("brl formata centavos em reais pt-BR", () => {
    expect(brl(1234)).toMatch(/^R\$\s12,34$/);
    expect(brl(0)).toMatch(/^R\$\s0,00$/);
  });

  it("distance alterna entre metros e km", () => {
    expect(distance(350)).toBe("350 m");
    expect(distance(1200)).toBe("1.2 km");
  });

  it("secondsUntil nunca retorna negativo", () => {
    expect(secondsUntil(undefined)).toBe(0);
    expect(secondsUntil(new Date(Date.now() - 5000).toISOString())).toBe(0);
    const future = secondsUntil(new Date(Date.now() + 10_000).toISOString());
    expect(future).toBeGreaterThan(8);
    expect(future).toBeLessThanOrEqual(10);
  });
});
