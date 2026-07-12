import type { ApiClient, CreateSlotInput, SlotDTO } from "@markethub/api-client";

/**
 * Módulo de API tipado dos slots de agendamento (story 55). Toda chamada HTTP
 * recebe o ApiClient e é tipada aqui — nunca `request`/`fetch` cru em tela/hook
 * (CLAUDE.md). Zero endpoint novo: reusa `GET/POST/DELETE store/slots` (S5.3).
 */
export function listStoreSlots(api: ApiClient, storeId: string): Promise<SlotDTO[]> {
  return api.merchantStoreSlots(storeId);
}

export function createSlot(api: ApiClient, input: CreateSlotInput): Promise<SlotDTO> {
  return api.merchantCreateSlot(input);
}

export function deleteSlot(api: ApiClient, slotId: string): Promise<{ removed: boolean }> {
  return api.merchantDeleteSlot(slotId);
}
