import { describe, expect, it } from "vitest";
import {
  createStoreClosureInputSchema,
  setStoreHoursInputSchema,
  storeHoursEntrySchema,
} from "./store-hours";

/**
 * Contratos de horário de funcionamento (story 52). Minutos desde a meia-noite;
 * `dayOfWeek` 0=domingo..6=sábado — mesmos limites validados pelo backend.
 */
describe("storeHoursEntrySchema", () => {
  it("aceita faixa válida nos limites (0–1439 abre, 1–1440 fecha)", () => {
    expect(
      storeHoursEntrySchema.safeParse({ dayOfWeek: 0, opensAt: 0, closesAt: 1440 }).success,
    ).toBe(true);
    expect(
      storeHoursEntrySchema.safeParse({ dayOfWeek: 6, opensAt: 1439, closesAt: 1440 }).success,
    ).toBe(true);
  });

  it("rejeita dayOfWeek fora de 0–6 e minutos fora dos limites", () => {
    const base = { dayOfWeek: 1, opensAt: 480, closesAt: 1080 };
    expect(storeHoursEntrySchema.safeParse({ ...base, dayOfWeek: 7 }).success).toBe(false);
    expect(storeHoursEntrySchema.safeParse({ ...base, dayOfWeek: -1 }).success).toBe(false);
    expect(storeHoursEntrySchema.safeParse({ ...base, opensAt: 1440 }).success).toBe(false);
    expect(storeHoursEntrySchema.safeParse({ ...base, closesAt: 0 }).success).toBe(false);
    expect(storeHoursEntrySchema.safeParse({ ...base, closesAt: 1441 }).success).toBe(false);
    expect(storeHoursEntrySchema.safeParse({ ...base, opensAt: 480.5 }).success).toBe(false);
  });
});

describe("setStoreHoursInputSchema (replace-all)", () => {
  it("aceita lista vazia (loja sem horário) e lista de faixas", () => {
    expect(setStoreHoursInputSchema.safeParse({ hours: [] }).success).toBe(true);
    expect(
      setStoreHoursInputSchema.safeParse({
        hours: [
          { dayOfWeek: 1, opensAt: 480, closesAt: 1080 },
          { dayOfWeek: 2, opensAt: 480, closesAt: 1080 },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejeita entrada inválida dentro da lista e hours ausente", () => {
    expect(
      setStoreHoursInputSchema.safeParse({ hours: [{ dayOfWeek: 9, opensAt: 0, closesAt: 60 }] })
        .success,
    ).toBe(false);
    expect(setStoreHoursInputSchema.safeParse({}).success).toBe(false);
  });
});

describe("createStoreClosureInputSchema", () => {
  it("aceita data YYYY-MM-DD com reason opcional/null", () => {
    expect(createStoreClosureInputSchema.safeParse({ date: "2026-12-25" }).success).toBe(true);
    expect(
      createStoreClosureInputSchema.safeParse({ date: "2026-12-25", reason: null }).success,
    ).toBe(true);
    expect(
      createStoreClosureInputSchema.safeParse({ date: "2026-12-25", reason: "Natal" }).success,
    ).toBe(true);
  });

  it("rejeita data fora do formato YYYY-MM-DD", () => {
    expect(createStoreClosureInputSchema.safeParse({ date: "25/12/2026" }).success).toBe(false);
    expect(createStoreClosureInputSchema.safeParse({ date: "2026-12-25T00:00:00Z" }).success).toBe(
      false,
    );
    expect(createStoreClosureInputSchema.safeParse({ date: "" }).success).toBe(false);
  });
});
