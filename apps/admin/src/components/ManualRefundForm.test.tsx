import { describe, expect, it } from "vitest";
import { parseBrlToCents } from "./ManualRefundForm";

/**
 * Máscara BRL → centavos do reembolso manual (story 67). A integração do form
 * (teto, submit) é coberta no OrderDetail.test.tsx.
 */
describe("parseBrlToCents", () => {
  it("converte formatos BRL comuns", () => {
    expect(parseBrlToCents("12,34")).toBe(1234);
    expect(parseBrlToCents("R$ 12,34")).toBe(1234);
    expect(parseBrlToCents("1.234,56")).toBe(123456);
    expect(parseBrlToCents("12.34")).toBe(1234); // ponto decimal também aceito
    expect(parseBrlToCents("50")).toBe(5000);
    expect(parseBrlToCents("0,5")).toBe(50);
  });

  it("rejeita entrada inválida", () => {
    expect(parseBrlToCents("")).toBeNull();
    expect(parseBrlToCents("abc")).toBeNull();
    expect(parseBrlToCents("12,345")).toBeNull(); // 3 casas decimais
    expect(parseBrlToCents("-5")).toBeNull();
    expect(parseBrlToCents("1,2,3")).toBeNull();
  });
});
