/**
 * Presets de período dos relatórios (story 13). Puro/testável: dado um preset e
 * um "agora", devolve a janela ISO {from,to} que vai como filtro p/ o backend.
 * `custom` deixa o usuário escolher as datas (tratado fora daqui).
 */
export type PeriodPreset = "today" | "7d" | "30d" | "custom";

export const PERIOD_PRESETS: { value: Exclude<PeriodPreset, "custom">; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Resolve {from,to} (ISO) p/ um preset, ancorado em `now` (default: agora). */
export function resolvePresetRange(preset: Exclude<PeriodPreset, "custom">, now: Date = new Date()): { from: string; to: string } {
  const to = now;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  let from: Date;
  if (preset === "today") {
    from = start;
  } else {
    const days = preset === "7d" ? 7 : 30;
    from = new Date(start.getTime() - (days - 1) * DAY_MS);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Converte uma data `YYYY-MM-DD` (input date) em ISO no início/fim do dia. */
export function dayToIso(day: string, edge: "start" | "end"): string | undefined {
  if (!day) return undefined;
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  if (edge === "end") d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
