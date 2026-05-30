import { completenessScore } from "./completeness";
import { HeuristicCategoryMapper } from "./mappers/heuristic.mapper";

describe("completenessScore", () => {
  it("0 when empty", () => {
    expect(
      completenessScore({
        name: false,
        gtin: false,
        brand: false,
        imageUrl: false,
        unit: false,
        category: false,
      }),
    ).toBe(0);
  });
  it("100 when all present", () => {
    expect(
      completenessScore({
        name: true,
        gtin: true,
        brand: true,
        imageUrl: true,
        unit: true,
        category: true,
      }),
    ).toBe(100);
  });
  it("partial sums weights", () => {
    // name(25) + gtin(15) = 40
    expect(
      completenessScore({
        name: true,
        gtin: true,
        brand: false,
        imageUrl: false,
        unit: false,
        category: false,
      }),
    ).toBe(40);
  });
});

describe("HeuristicCategoryMapper", () => {
  const mapper = new HeuristicCategoryMapper();
  it.each([
    ["Refrigerantes", "bebidas"],
    ["Leite e derivados", "bebidas"],
    ["Carne bovina", "acougue"],
    ["Frutas frescas", "hortifruti"],
    ["Pães e bolos", "padaria"],
    ["Açúcar", "mercearia"],
  ])("%s -> %s", async (input, slug) => {
    const r = await mapper.classify(input);
    expect(r?.slug).toBe(slug);
  });
  it("unknown -> mercearia low confidence", async () => {
    const r = await mapper.classify("Categoria Desconhecida XYZ");
    expect(r?.slug).toBe("mercearia");
    expect(r?.confidence).toBeLessThan(0.5);
  });
});
