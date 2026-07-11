/**
 * Máscara HH:MM ↔ minutos desde a meia-noite (story 52). O backend guarda o
 * horário em minutos (`opensAt`/`closesAt`); a UI edita como "HH:MM".
 */

/** "08:30" → 510. Retorna null se o formato/intervalo for inválido. */
export function hhmmToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 510 → "08:30". Minuto 1440 (meia-noite do dia seguinte) → "24:00". */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Valida "HH:MM" (00:00–24:00, aceita 24:00 como fechamento). */
export function isValidHHMM(value: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h === 24) return min === 0;
  return h <= 23 && min <= 59;
}

/** "HH:MM" → minutos aceitando 24:00 = 1440 (fechamento no fim do dia). */
export function hhmmToMinutesClosing(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h === 24 && min === 0) return 1440;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Rótulos dos dias da semana (0=domingo..6=sábado). */
export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;
