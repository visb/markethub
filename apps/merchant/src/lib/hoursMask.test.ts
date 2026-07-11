import { describe, expect, it } from "vitest";
import {
  WEEKDAY_LABELS,
  hhmmToMinutes,
  hhmmToMinutesClosing,
  isValidHHMM,
  minutesToHHMM,
} from "./hoursMask";

describe("hoursMask (story 52)", () => {
  it("hhmmToMinutes converte HH:MM → minutos", () => {
    expect(hhmmToMinutes("08:30")).toBe(510);
    expect(hhmmToMinutes("00:00")).toBe(0);
    expect(hhmmToMinutes("23:59")).toBe(1439);
  });

  it("hhmmToMinutes rejeita formato/intervalo inválido", () => {
    expect(hhmmToMinutes("8h30")).toBeNull();
    expect(hhmmToMinutes("25:00")).toBeNull();
    expect(hhmmToMinutes("10:99")).toBeNull();
  });

  it("minutesToHHMM formata com zero à esquerda", () => {
    expect(minutesToHHMM(510)).toBe("08:30");
    expect(minutesToHHMM(0)).toBe("00:00");
    expect(minutesToHHMM(1440)).toBe("24:00");
  });

  it("isValidHHMM aceita 00:00–24:00 (24:00 só com :00)", () => {
    expect(isValidHHMM("08:00")).toBe(true);
    expect(isValidHHMM("24:00")).toBe(true);
    expect(isValidHHMM("24:30")).toBe(false);
    expect(isValidHHMM("99:00")).toBe(false);
    expect(isValidHHMM("abc")).toBe(false);
  });

  it("hhmmToMinutesClosing aceita 24:00 = 1440", () => {
    expect(hhmmToMinutesClosing("24:00")).toBe(1440);
    expect(hhmmToMinutesClosing("18:00")).toBe(1080);
    expect(hhmmToMinutesClosing("24:30")).toBeNull();
    expect(hhmmToMinutesClosing("xx")).toBeNull();
  });

  it("WEEKDAY_LABELS começa no domingo e tem 7 dias", () => {
    expect(WEEKDAY_LABELS).toHaveLength(7);
    expect(WEEKDAY_LABELS[0]).toBe("Domingo");
    expect(WEEKDAY_LABELS[6]).toBe("Sábado");
  });
});
