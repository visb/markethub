import { ApiClientError } from "@markethub/api-client";

/**
 * Geração de slots em lote (story 55) — client-side, zero endpoint novo. Expande
 * um período + dias da semana + janela diária + duração em N janelas
 * `{ start, end }`, que a tela dispara em POSTs SEQUENCIAIS. O `@@unique(storeId,
 * start,end)` do backend deduplica: um conflito (409) é contabilizado como
 * "pulado" em vez de erro.
 */

export interface SlotBatchSpec {
  /** Período (inclusive) em datas locais YYYY-MM-DD. */
  dateFrom: string;
  dateTo: string;
  /** Dias da semana a gerar (0=domingo..6=sábado). */
  weekdays: number[];
  /** Janela diária HH:MM (ex. "08:00"–"20:00"). */
  windowStart: string;
  windowEnd: string;
  /** Duração de cada slot, em minutos. */
  durationMin: number;
}

/** Uma janela expandida em relógio de parede (data local + horários HH:MM). */
export interface SlotWindow {
  date: string;
  start: string;
  end: string;
}

/** "HH:MM" → minutos desde a meia-noite; null se malformado. */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** minutos desde a meia-noite → "HH:MM". */
function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Dia da semana (0..6) de uma data YYYY-MM-DD, sem depender do fuso local. */
function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Itera as datas locais de `from` a `to` (inclusive). */
function eachDate(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  const [y, m, d] = from.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  const end = (() => {
    const [ty, tm, td] = to.split("-").map(Number);
    return new Date(Date.UTC(ty, tm - 1, td));
  })();
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Expande a especificação em janelas de relógio de parede. Retorna `[]` quando os
 * parâmetros são inconsistentes (janela vazia/invertida, duração ≤ 0, sem dias) —
 * o preview mostra 0 e nada é disparado.
 */
export function expandSlotBatch(spec: SlotBatchSpec): SlotWindow[] {
  const startMin = toMinutes(spec.windowStart);
  const endMin = toMinutes(spec.windowEnd);
  if (startMin == null || endMin == null) return [];
  if (endMin <= startMin) return [];
  if (!Number.isInteger(spec.durationMin) || spec.durationMin <= 0) return [];
  if (spec.weekdays.length === 0) return [];

  const days = new Set(spec.weekdays);
  const windows: SlotWindow[] = [];
  for (const date of eachDate(spec.dateFrom, spec.dateTo)) {
    if (!days.has(weekdayOf(date))) continue;
    for (let cur = startMin; cur + spec.durationMin <= endMin; cur += spec.durationMin) {
      windows.push({ date, start: fromMinutes(cur), end: fromMinutes(cur + spec.durationMin) });
    }
  }
  return windows;
}

/** Janela de relógio de parede (data local + HH:MM) → par de ISO-8601 (UTC). */
export function slotWindowToIso(w: SlotWindow): { start: string; end: string } {
  return {
    start: new Date(`${w.date}T${w.start}:00`).toISOString(),
    end: new Date(`${w.date}T${w.end}:00`).toISOString(),
  };
}

export interface SlotBatchResult {
  created: number;
  skipped: number;
}

/**
 * Dispara `create` para cada janela em SEQUÊNCIA. Um 409 (slot já existente pela
 * `@@unique`) é contabilizado como "pulado"; qualquer outro erro aborta o lote.
 */
export async function runSlotBatch(
  create: (window: { start: string; end: string }) => Promise<unknown>,
  windows: SlotWindow[],
): Promise<SlotBatchResult> {
  let created = 0;
  let skipped = 0;
  for (const w of windows) {
    try {
      await create(slotWindowToIso(w));
      created += 1;
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        skipped += 1;
        continue;
      }
      throw err;
    }
  }
  return { created, skipped };
}
