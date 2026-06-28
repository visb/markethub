import { parseCsv, toBool, toInt, toIntOrNull } from "./csv.util";

/**
 * Backfill de cobertura (story 26). Parser CSV mínimo + coerções usadas pelo
 * CsvErpConnector. Cabeçalho na 1ª linha, campos entre aspas, linhas em branco
 * ignoradas e coerção tolerante de int/bool.
 */

describe("parseCsv", () => {
  it("retorna vazio para conteúdo sem linhas", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("mapeia cabeçalho para chaves e trima as células", () => {
    const csv = "a,b,c\n 1 , 2 ,3";
    expect(parseCsv(csv)).toEqual([{ a: "1", b: "2", c: "3" }]);
  });

  it("preenche com string vazia colunas ausentes na linha", () => {
    const csv = "a,b,c\n1,2";
    expect(parseCsv(csv)).toEqual([{ a: "1", b: "2", c: "" }]);
  });

  it("ignora linhas em branco no meio e no fim", () => {
    const csv = "a\n1\n\n2\n";
    expect(parseCsv(csv)).toEqual([{ a: "1" }, { a: "2" }]);
  });

  it("normaliza quebras de linha CRLF e CR", () => {
    expect(parseCsv("a\r\n1\r2")).toEqual([{ a: "1" }, { a: "2" }]);
  });

  it("respeita vírgulas dentro de campos entre aspas", () => {
    const csv = 'a,b\n"x,y",z';
    expect(parseCsv(csv)).toEqual([{ a: "x,y", b: "z" }]);
  });

  it("trata aspas duplas escapadas dentro do campo", () => {
    const csv = 'a\n"diz ""oi"""';
    expect(parseCsv(csv)).toEqual([{ a: 'diz "oi"' }]);
  });
});

describe("toInt", () => {
  it("converte string numérica em inteiro truncado", () => {
    expect(toInt("479")).toBe(479);
    expect(toInt("5.9")).toBe(5);
  });

  it("retorna 0 para indefinido ou não numérico", () => {
    expect(toInt(undefined)).toBe(0);
    expect(toInt("abc")).toBe(0);
  });
});

describe("toIntOrNull", () => {
  it("retorna null para ausente, vazio ou não numérico", () => {
    expect(toIntOrNull(undefined)).toBeNull();
    expect(toIntOrNull("")).toBeNull();
    expect(toIntOrNull("xyz")).toBeNull();
  });

  it("converte numérico em inteiro truncado", () => {
    expect(toIntOrNull("12")).toBe(12);
    expect(toIntOrNull("12.7")).toBe(12);
  });
});

describe("toBool", () => {
  it("usa o fallback (true) quando ausente ou vazio", () => {
    expect(toBool(undefined)).toBe(true);
    expect(toBool("")).toBe(true);
  });

  it("respeita fallback customizado", () => {
    expect(toBool(undefined, false)).toBe(false);
  });

  it("reconhece valores verdadeiros independente de caixa", () => {
    for (const v of ["1", "true", "TRUE", "sim", "Yes", "y"]) {
      expect(toBool(v)).toBe(true);
    }
  });

  it("trata demais valores como falso", () => {
    for (const v of ["0", "false", "nao", "n"]) {
      expect(toBool(v)).toBe(false);
    }
  });
});
