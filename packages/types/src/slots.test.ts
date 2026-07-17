import { describe, expect, it } from "vitest";
import { createSlotInputSchema } from "./slots";

/**
 * Contrato de slots de agendamento (S5.3 / story 55). O refine da janela
 * (`end` > `start`) espelha o `INVALID_SLOT_WINDOW` do backend.
 */
describe("createSlotInputSchema", () => {
  const base = {
    storeId: "s1",
    start: "2026-07-20T10:00:00.000Z",
    end: "2026-07-20T12:00:00.000Z",
    capacity: 5,
  };

  it("aceita janela válida com capacity ≥ 1", () => {
    expect(createSlotInputSchema.safeParse(base).success).toBe(true);
    expect(createSlotInputSchema.safeParse({ ...base, capacity: 1 }).success).toBe(true);
  });

  it("rejeita end ≤ start (refine da janela, path em end)", () => {
    const r = createSlotInputSchema.safeParse({ ...base, end: base.start });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path).toEqual(["end"]);
      expect(r.error.issues[0]?.message).toBe("Janela inválida");
    }
    expect(
      createSlotInputSchema.safeParse({ ...base, end: "2026-07-20T09:00:00.000Z" }).success,
    ).toBe(false);
  });

  it("rejeita capacity 0, não-inteira e campos vazios", () => {
    expect(createSlotInputSchema.safeParse({ ...base, capacity: 0 }).success).toBe(false);
    expect(createSlotInputSchema.safeParse({ ...base, capacity: 1.5 }).success).toBe(false);
    expect(createSlotInputSchema.safeParse({ ...base, storeId: "" }).success).toBe(false);
    expect(createSlotInputSchema.safeParse({ ...base, start: "" }).success).toBe(false);
  });
});
