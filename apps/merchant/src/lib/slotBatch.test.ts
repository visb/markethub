import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@markethub/api-client";
import {
  expandSlotBatch,
  runSlotBatch,
  slotWindowToIso,
  type SlotBatchSpec,
  type SlotWindow,
} from "./slotBatch";

const base: SlotBatchSpec = {
  dateFrom: "2026-07-01", // quarta-feira
  dateTo: "2026-07-07", // terça-feira seguinte
  weekdays: [3], // só quartas → 01/07 e ... (não há outra quarta no intervalo)
  windowStart: "08:00",
  windowEnd: "12:00",
  durationMin: 60,
};

describe("expandSlotBatch (story 55)", () => {
  it("expande a janela em slots de duração fixa por dia elegível", () => {
    const out = expandSlotBatch(base);
    // 01/07 (qua) apenas; 08–12 / 60min = 4 slots
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({ date: "2026-07-01", start: "08:00", end: "09:00" });
    expect(out[3]).toEqual({ date: "2026-07-01", start: "11:00", end: "12:00" });
  });

  it("gera para múltiplos dias da semana no período", () => {
    // 01/07 qua .. 07/07 ter: seg=06/07, qua=01/07 → 2 dias, 4 slots cada
    const out = expandSlotBatch({ ...base, weekdays: [1, 3] });
    const dias = new Set(out.map((w) => w.date));
    expect(dias).toEqual(new Set(["2026-07-01", "2026-07-06"]));
    expect(out).toHaveLength(8);
  });

  it("não passa do fim da janela quando a duração não fecha certo", () => {
    const out = expandSlotBatch({ ...base, windowEnd: "11:30", durationMin: 60 });
    // 08–11:30 / 60min → 08-09, 09-10, 10-11 (11-12 passaria de 11:30) = 3
    expect(out).toHaveLength(3);
    expect(out.at(-1)).toEqual({ date: "2026-07-01", start: "10:00", end: "11:00" });
  });

  it("retorna [] em parâmetros inconsistentes (janela invertida, sem dias, duração <= 0)", () => {
    expect(expandSlotBatch({ ...base, windowEnd: "08:00" })).toEqual([]);
    expect(expandSlotBatch({ ...base, weekdays: [] })).toEqual([]);
    expect(expandSlotBatch({ ...base, durationMin: 0 })).toEqual([]);
    expect(expandSlotBatch({ ...base, windowStart: "8h" })).toEqual([]);
    expect(expandSlotBatch({ ...base, dateFrom: "2026-07-08" })).toEqual([]); // from > to
  });
});

describe("slotWindowToIso", () => {
  it("converte relógio de parede em par de ISO-8601", () => {
    const w: SlotWindow = { date: "2026-07-01", start: "08:00", end: "09:00" };
    const iso = slotWindowToIso(w);
    // a hora exata depende do fuso do runner; o par deve ser consistente (fim 1h após início)
    expect(new Date(iso.end).getTime() - new Date(iso.start).getTime()).toBe(3_600_000);
    expect(iso.start).toMatch(/^2026-07-0\dT/);
  });
});

describe("runSlotBatch (story 55)", () => {
  it("dispara um create por janela (preview bate com os POSTs)", async () => {
    const windows = expandSlotBatch(base);
    const create = vi.fn().mockResolvedValue({});
    const res = await runSlotBatch(create, windows);
    expect(create).toHaveBeenCalledTimes(windows.length);
    expect(res).toEqual({ created: 4, skipped: 0 });
  });

  it("trata 409 (duplicata pela @@unique) como pulado", async () => {
    const windows = expandSlotBatch(base);
    const create = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new ApiClientError(409, { code: "CONFLICT", message: "existe" }))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const res = await runSlotBatch(create, windows);
    expect(res).toEqual({ created: 3, skipped: 1 });
  });

  it("aborta o lote em erro que não seja 409", async () => {
    const windows = expandSlotBatch(base);
    const create = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new ApiClientError(400, { code: "INVALID_SLOT_WINDOW", message: "ruim" }));
    await expect(runSlotBatch(create, windows)).rejects.toBeInstanceOf(ApiClientError);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
