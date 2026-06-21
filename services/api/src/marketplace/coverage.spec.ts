import { isCityCovered, normalizeCity } from "./coverage";

describe("normalizeCity", () => {
  it("remove acentos, caixa e colapsa espaços", () => {
    expect(normalizeCity("  São   José dos Pinhais ")).toBe("sao jose dos pinhais");
    expect(normalizeCity("ARAUCÁRIA")).toBe("araucaria");
  });
});

describe("isCityCovered", () => {
  it.each([
    ["Curitiba", "PR"],
    ["são josé dos pinhais", "pr"],
    ["ALMIRANTE TAMANDARÉ", "PR"],
    ["Araucaria", "pr"], // sem acento ainda casa
  ])("cidade coberta %s/%s", (city, state) => {
    expect(isCityCovered(city, state)).toBe(true);
  });

  it("cidade fora da área não é coberta", () => {
    expect(isCityCovered("São Paulo", "SP")).toBe(false);
    expect(isCityCovered("Curitiba", "SP")).toBe(false); // estado errado
  });

  it("tolera espaços extras no estado", () => {
    expect(isCityCovered("Curitiba", " pr ")).toBe(true);
  });
});
