// Rótulo do badge de funcionamento da loja (story 52). Puro (testável) — recebe
// o estado já computado pelo servidor (timezone America/Sao_Paulo).

export interface StoreOpenState {
  openNow: boolean;
  /** Loja em pausa temporária (story 57): tem precedência sobre o horário no rótulo. */
  paused?: boolean;
  todayHours: { opensAt: number; closesAt: number } | null;
  nextOpen: { dayOfWeek: number; opensAt: number } | null;
}

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

/** Minutos desde a meia-noite → "HH:MM". */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Texto amigável do estado da loja:
 * - pausada (story 57): "Pausada" — precede o horário (emergência temporária);
 * - aberta: "Aberto · fecha às HH:MM" (ou só "Aberto" sem horário de hoje);
 * - fechada com próxima abertura hoje: "Fechado · abre às HH:MM";
 * - fechada com abertura em outro dia: "Fechado · abre seg às HH:MM";
 * - fechada sem horário: "Fechado".
 */
export function storeOpenLabel(state: StoreOpenState, todayDow?: number): string {
  if (state.paused) return "Pausada";
  if (state.openNow) {
    return state.todayHours ? `Aberto · fecha às ${minutesToHHMM(state.todayHours.closesAt)}` : "Aberto";
  }
  if (!state.nextOpen) return "Fechado";
  const sameDay = todayDow != null && state.nextOpen.dayOfWeek === todayDow;
  const time = minutesToHHMM(state.nextOpen.opensAt);
  if (sameDay) return `Fechado · abre às ${time}`;
  return `Fechado · abre ${WEEKDAY_SHORT[state.nextOpen.dayOfWeek]} às ${time}`;
}
