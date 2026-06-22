import type {
  ApiClient,
  CreateMerchantStaffInput,
  MerchantStaffDTO,
  UpdateMerchantStaffInput,
} from "@markethub/api-client";

/**
 * Módulo de API tipado dos colaboradores (StoreStaff — story 10). Toda chamada
 * HTTP recebe o ApiClient e é tipada aqui — nunca `request`/`fetch` cru em
 * tela/hook (CLAUDE.md).
 */
export function listStaff(api: ApiClient, storeId?: string): Promise<MerchantStaffDTO[]> {
  return api.merchantStaff(storeId);
}

export function createStaff(api: ApiClient, input: CreateMerchantStaffInput) {
  return api.merchantCreateStaff(input);
}

export function updateStaff(api: ApiClient, id: string, patch: UpdateMerchantStaffInput) {
  return api.merchantUpdateStaff(id, patch);
}

export function removeStaff(api: ApiClient, id: string, hard = false) {
  return api.merchantRemoveStaff(id, hard);
}
