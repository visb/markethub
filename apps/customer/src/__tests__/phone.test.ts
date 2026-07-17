import { formatPhoneBR, onlyDigits } from "../lib/phone";

/** Story 70: máscara/normalização de telefone BR do form de conta. */

describe("onlyDigits", () => {
  it("remove máscara e qualquer não-dígito", () => {
    expect(onlyDigits("(41) 99999-1234")).toBe("41999991234");
    expect(onlyDigits("abc")).toBe("");
    expect(onlyDigits("")).toBe("");
  });
});

describe("formatPhoneBR", () => {
  it("máscara progressiva enquanto digita", () => {
    expect(formatPhoneBR("")).toBe("");
    expect(formatPhoneBR("4")).toBe("(4");
    expect(formatPhoneBR("41")).toBe("(41");
    expect(formatPhoneBR("419")).toBe("(41) 9");
    expect(formatPhoneBR("419999")).toBe("(41) 9999");
    expect(formatPhoneBR("4199991")).toBe("(41) 9999-1");
  });

  it("fixo (10 dígitos) → (41) 3333-4444", () => {
    expect(formatPhoneBR("4133334444")).toBe("(41) 3333-4444");
  });

  it("celular (11 dígitos) → (41) 99999-1234", () => {
    expect(formatPhoneBR("41999991234")).toBe("(41) 99999-1234");
  });

  it("aceita entrada já formatada e trunca além de 11 dígitos", () => {
    expect(formatPhoneBR("(41) 99999-1234")).toBe("(41) 99999-1234");
    expect(formatPhoneBR("4199999123456789")).toBe("(41) 99999-1234");
  });
});
