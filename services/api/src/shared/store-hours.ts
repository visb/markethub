/**
 * Cálculo de horário de funcionamento da loja (story 29/52). Kernel compartilhado:
 * puro (sem I/O), importável por qualquer contexto (catalog, fulfillment, merchant).
 *
 * Horário semanal (`StoreHours`): uma faixa abre–fecha por dia (`dayOfWeek`
 * 0=domingo..6=sábado); `opensAt`/`closesAt` em minutos desde a meia-noite. Dia
 * sem linha = fechado. Janelas que cruzam a meia-noite ficam fora de escopo
 * (assume `closesAt > opensAt`).
 *
 * Fechamento excepcional (`StoreClosure`, story 52): uma data (America/Sao_Paulo)
 * fecha o dia INTEIRO, sobrepondo o horário semanal (feriado/evento).
 */

/** Faixa abre–fecha de um dia da semana (minutos desde a meia-noite). */
export interface StoreHoursSlot {
  dayOfWeek: number;
  opensAt: number;
  closesAt: number;
}

/** Dia da semana + minuto do dia + data ISO, tudo em America/Sao_Paulo. */
export interface SaoPauloNow {
  dayOfWeek: number;
  minuteOfDay: number;
  /** Data local no formato YYYY-MM-DD (p/ comparar com fechamentos). */
  dateISO: string;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Hora atual em America/Sao_Paulo → dia da semana (0=domingo..6=sábado), minuto
 * do dia (0..1439) e data local (YYYY-MM-DD). Computado no servidor p/ evitar bug
 * de timezone no cliente.
 */
export function saoPauloNow(now: Date): SaoPauloNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dayOfWeek = WEEKDAY_MAP[get("weekday")] ?? 0;
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // alguns runtimes emitem "24" à meia-noite
  const minuteOfDay = hour * 60 + Number(get("minute"));
  const dateISO = `${get("year")}-${get("month")}-${get("day")}`;
  return { dayOfWeek, minuteOfDay, dateISO };
}

/**
 * Hora atual em America/Sao_Paulo → dia da semana + minuto do dia. Mantido p/
 * compatibilidade com chamadas existentes (catalog).
 */
export function saoPauloDayAndMinute(now: Date): { dayOfWeek: number; minuteOfDay: number } {
  const { dayOfWeek, minuteOfDay } = saoPauloNow(now);
  return { dayOfWeek, minuteOfDay };
}

/** Normaliza a data de um fechamento (Date @db.Date ou string) → YYYY-MM-DD. */
export function closureDateISO(date: Date | string): string {
  if (typeof date === "string") return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

/**
 * Loja aberta se há linha de horário do dia com `opensAt ≤ minuto < closesAt`
 * (abertura inclusiva, fechamento exclusivo). Dia sem linha = fechado. Não
 * considera fechamento excepcional — use `isStoreOpen` p/ o cálculo completo.
 */
export function isOpenAt(
  hours: StoreHoursSlot[],
  dayOfWeek: number,
  minuteOfDay: number,
): boolean {
  const today = hours.find((h) => h.dayOfWeek === dayOfWeek);
  if (!today) return false;
  return today.opensAt <= minuteOfDay && minuteOfDay < today.closesAt;
}

/**
 * Cálculo completo do "aberto agora" (story 52): fechamento excepcional na data de
 * hoje fecha o dia inteiro; senão aplica o horário semanal (`isOpenAt`).
 */
export function isStoreOpen(
  hours: StoreHoursSlot[],
  closures: (Date | string)[],
  now: Date = new Date(),
): boolean {
  const { dayOfWeek, minuteOfDay, dateISO } = saoPauloNow(now);
  if (closures.some((c) => closureDateISO(c) === dateISO)) return false;
  return isOpenAt(hours, dayOfWeek, minuteOfDay);
}

/**
 * Política de disponibilidade da loja p/ checkout e badges (story 52). Loja SEM
 * horário configurado (`hours.length === 0`) é tratada como sempre disponível —
 * preserva o comportamento pré-52 (não bloqueia checkout nem exibe "Fechado").
 * Com horário configurado, aplica o cálculo completo (`isStoreOpen`: horário
 * semanal + fechamento excepcional do dia).
 */
export function isStoreAvailable(
  hours: StoreHoursSlot[],
  closures: (Date | string)[],
  now: Date = new Date(),
): boolean {
  if (hours.length === 0) return true;
  return isStoreOpen(hours, closures, now);
}

/** Faixa de hoje (opensAt/closesAt) ou null se hoje é fechado (folga/closure). */
export function todayHours(
  hours: StoreHoursSlot[],
  closures: (Date | string)[],
  now: Date = new Date(),
): { opensAt: number; closesAt: number } | null {
  const { dayOfWeek, dateISO } = saoPauloNow(now);
  if (closures.some((c) => closureDateISO(c) === dateISO)) return null;
  const today = hours.find((h) => h.dayOfWeek === dayOfWeek);
  return today ? { opensAt: today.opensAt, closesAt: today.closesAt } : null;
}

/**
 * Próxima abertura a partir de agora (story 52) — p/ o badge "abre às HH:MM".
 * Varre o dia corrente (se ainda vai abrir) e os próximos 7 dias, pulando datas
 * com fechamento excepcional. `daysAhead` 0 = hoje, 1 = amanhã, etc. Null quando
 * a loja não tem horário nenhum nos próximos 7 dias.
 */
export function nextOpening(
  hours: StoreHoursSlot[],
  closures: (Date | string)[],
  now: Date = new Date(),
): { dayOfWeek: number; opensAt: number; daysAhead: number } | null {
  const { dayOfWeek, minuteOfDay, dateISO } = saoPauloNow(now);
  const closedSet = new Set(closures.map((c) => closureDateISO(c)));
  const base = new Date(`${dateISO}T00:00:00Z`);
  for (let ahead = 0; ahead <= 7; ahead += 1) {
    const dow = (dayOfWeek + ahead) % 7;
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() + ahead);
    if (closedSet.has(day.toISOString().slice(0, 10))) continue;
    const slot = hours.find((h) => h.dayOfWeek === dow);
    if (!slot) continue;
    // hoje: só conta se a abertura ainda não passou
    if (ahead === 0 && slot.opensAt <= minuteOfDay) continue;
    return { dayOfWeek: dow, opensAt: slot.opensAt, daysAhead: ahead };
  }
  return null;
}
