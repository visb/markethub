import {
  cleanGtin,
  inferSaleType,
  isValidGtin,
  normalizeGtin,
  slugify,
} from "./catalog-normalize";

describe("slugify", () => {
  it.each([
    ["Padaria", "padaria"],
    ["Hortifruti", "hortifruti"],
    ["Açougue", "acougue"],
    ["Bebidas & Sucos", "bebidas-sucos"],
  ])("%s -> %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe("cleanGtin", () => {
  it("keeps only digits", () => {
    expect(cleanGtin("789-1000_100103")).toBe("7891000100103");
  });
  it("returns null for empty/short", () => {
    expect(cleanGtin(null)).toBeNull();
    expect(cleanGtin("123")).toBeNull();
    expect(cleanGtin("")).toBeNull();
  });
});

describe("isValidGtin", () => {
  it.each(["7891000100103", "7894900011517", "7891910000197"])("valid EAN-13 %s", (g) => {
    expect(isValidGtin(g)).toBe(true);
  });
  it("rejects bad check digit", () => {
    expect(isValidGtin("7891000100104")).toBe(false);
  });
  it("rejects wrong length", () => {
    expect(isValidGtin("12345")).toBe(false);
  });
});

describe("normalizeGtin", () => {
  it("cleans and validates", () => {
    expect(normalizeGtin("789-1000_100103")).toBe("7891000100103");
  });
  it("returns null for invalid check digit", () => {
    expect(normalizeGtin("7891000100104")).toBeNull();
  });
});

describe("inferSaleType", () => {
  it.each([
    ["kg", null, "weight"], // vendido por peso
    ["g", null, "weight"],
    ["2L", null, "unit"], // embalado
    ["380g", null, "unit"], // embalado (tem número)
    ["1kg", null, "unit"], // pacote de 1kg = unidade
    ["un", null, "unit"],
  ])("label %s -> %s", (label, cat, expected) => {
    expect(inferSaleType(label, cat as string | null)).toBe(expected);
  });
  it("açougue sem rótulo -> weight", () => {
    expect(inferSaleType(null, "acougue")).toBe("weight");
    expect(inferSaleType("", "hortifruti")).toBe("weight");
  });
  it("bebidas sem rótulo -> unit", () => {
    expect(inferSaleType(null, "bebidas")).toBe("unit");
  });
});
