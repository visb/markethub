import { describe, expect, it } from "vitest";
import { dayToIso, resolvePresetRange } from "./reportPeriod";

describe("resolvePresetRange (story 13)", () => {
  const now = new Date("2026-06-22T15:30:00.000Z");

  it("today: from = início do dia, to = agora", () => {
    const { from, to } = resolvePresetRange("today", now);
    expect(new Date(from).getHours()).toBe(0);
    expect(new Date(from).getMinutes()).toBe(0);
    expect(to).toBe(now.toISOString());
  });

  it("7d: janela de 7 dias (início do dia -6)", () => {
    const { from, to } = resolvePresetRange("7d", now);
    const diffDays = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
    expect(diffDays).toBeGreaterThan(6);
    expect(diffDays).toBeLessThan(7);
  });

  it("30d: janela de 30 dias", () => {
    const { from, to } = resolvePresetRange("30d", now);
    const diffDays = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
    expect(diffDays).toBeGreaterThan(29);
    expect(diffDays).toBeLessThan(30);
  });
});

describe("dayToIso (story 13)", () => {
  it("start usa 00:00, end usa 23:59:59.999", () => {
    expect(dayToIso("2026-06-01", "start")).toBe(new Date("2026-06-01T00:00:00").toISOString());
    const end = new Date(dayToIso("2026-06-01", "end")!);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it("vazio/ inválido → undefined", () => {
    expect(dayToIso("", "start")).toBeUndefined();
    expect(dayToIso("não-é-data", "start")).toBeUndefined();
  });
});
