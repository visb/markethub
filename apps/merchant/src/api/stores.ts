import type {
  ApiClient,
  MerchantStoreDetailDTO,
  MerchantStoreInput,
  MerchantStoreUpdateInput,
} from "@markethub/api-client";

/**
 * Módulo de API tipado do CRUD de lojas (story 08). Toda chamada HTTP recebe o
 * ApiClient e é tipada aqui — nunca `request`/`fetch` cru em tela/hook (CLAUDE.md).
 */
export function listStores(api: ApiClient): Promise<MerchantStoreDetailDTO[]> {
  return api.merchantStoresDetail();
}

export function createStore(
  api: ApiClient,
  input: MerchantStoreInput,
): Promise<MerchantStoreDetailDTO> {
  return api.merchantCreateStore(input);
}

export function updateStore(
  api: ApiClient,
  id: string,
  patch: MerchantStoreUpdateInput,
): Promise<MerchantStoreDetailDTO> {
  return api.merchantUpdateStore(id, patch);
}

/** Pausa a loja (bloqueia todo pedido novo — story 57). Idempotente no backend. */
export function pauseStore(api: ApiClient, id: string): Promise<MerchantStoreDetailDTO> {
  return api.merchantPauseStore(id);
}

/** Retoma a loja pausada (story 57). Idempotente no backend. */
export function resumeStore(api: ApiClient, id: string): Promise<MerchantStoreDetailDTO> {
  return api.merchantResumeStore(id);
}
