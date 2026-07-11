import { z } from "zod";

// Horário de funcionamento + fechamentos excepcionais (story 52).
// Contratos compartilhados entre o app merchant (edição) e o customer (badge).
// `opensAt`/`closesAt` em minutos desde a meia-noite; `dayOfWeek` 0=domingo..6=sábado.

/** Uma faixa abre–fecha de um dia da semana. */
export const storeHoursEntrySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  opensAt: z.number().int().min(0).max(1439),
  closesAt: z.number().int().min(1).max(1440),
});
export type StoreHoursEntryInput = z.infer<typeof storeHoursEntrySchema>;

/** Linha de horário como devolvida pela API (inclui id). */
export interface StoreHoursDTO {
  id: string;
  dayOfWeek: number;
  opensAt: number;
  closesAt: number;
}

/** Payload de substituição do horário semanal inteiro (replace-all). */
export const setStoreHoursInputSchema = z.object({
  hours: z.array(storeHoursEntrySchema),
});
export type SetStoreHoursInput = z.infer<typeof setStoreHoursInputSchema>;

/** Fechamento excepcional (feriado/evento) — fecha o dia inteiro. */
export interface StoreClosureDTO {
  id: string;
  /** Data local YYYY-MM-DD (America/Sao_Paulo). */
  date: string;
  reason: string | null;
}

/** Payload de criação de um fechamento (data YYYY-MM-DD + motivo opcional). */
export const createStoreClosureInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
  reason: z.string().nullable().optional(),
});
export type CreateStoreClosureInput = z.infer<typeof createStoreClosureInputSchema>;

/**
 * Estado de funcionamento da loja p/ o badge da página da loja (story 52).
 * `todayHours` null = hoje fechado (folga ou fechamento excepcional); `nextOpen`
 * é a próxima abertura (dia + minuto) p/ o texto "abre às HH:MM".
 */
export interface StoreOpenStateDTO {
  openNow: boolean;
  todayHours: { opensAt: number; closesAt: number } | null;
  nextOpen: { dayOfWeek: number; opensAt: number } | null;
}
