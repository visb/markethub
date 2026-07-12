import { z } from "zod";

/**
 * Slots de capacidade de agendamento por loja (S5.3 / story 55). Contratos da
 * gestão pelo app merchant: listagem (inclui slots cheios) + payload de criação.
 * `start`/`end` em ISO-8601 (UTC); `capacity` é o limite de pedidos na janela e
 * `reserved` quantas vagas já foram tomadas.
 */

/** Slot como devolvido pela API de gestão (`GET store/slots`). */
export interface SlotDTO {
  id: string;
  storeId: string;
  start: string;
  end: string;
  capacity: number;
  reserved: number;
  createdAt: string;
}

/**
 * Payload de criação de um slot (`POST store/slots`). `end` deve ser posterior a
 * `start` e `capacity` ≥ 1 — o backend reforça (`INVALID_SLOT_WINDOW` /
 * `INVALID_CAPACITY`).
 */
export const createSlotInputSchema = z
  .object({
    storeId: z.string().min(1),
    start: z.string().min(1),
    end: z.string().min(1),
    capacity: z.number().int().min(1),
  })
  .refine((v) => new Date(v.end) > new Date(v.start), {
    message: "Janela inválida",
    path: ["end"],
  });
export type CreateSlotInput = z.infer<typeof createSlotInputSchema>;
