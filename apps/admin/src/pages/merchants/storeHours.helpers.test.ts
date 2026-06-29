import { describe, expect, it } from "vitest";

import { hhmmToMin, minToHHMM } from "./StoreDetail";

// Helpers de horário de funcionamento (story 29): conversão minutos-desde-meia-noite ↔ "HH:MM".
describe("minToHHMM", () => {
  it("formata minutos com zero à esquerda", () => {
    expect(minToHHMM(0)).toBe("00:00");
    expect(minToHHMM(480)).toBe("08:00");
    expect(minToHHMM(1290)).toBe("21:30");
    expect(minToHHMM(1439)).toBe("23:59");
  });
});

describe("hhmmToMin", () => {
  it("converte HH:MM em minutos", () => {
    expect(hhmmToMin("00:00")).toBe(0);
    expect(hhmmToMin("08:00")).toBe(480);
    expect(hhmmToMin("21:30")).toBe(1290);
  });

  it("clampa fora da faixa [0, 1439] e tolera minuto ausente", () => {
    expect(hhmmToMin("99:99")).toBe(1439);
    expect(hhmmToMin("-1:00")).toBe(0);
    expect(hhmmToMin("07")).toBe(420);
  });

  it("é inverso de minToHHMM nos valores válidos", () => {
    for (const m of [0, 480, 1290, 1439]) {
      expect(hhmmToMin(minToHHMM(m))).toBe(m);
    }
  });
});
