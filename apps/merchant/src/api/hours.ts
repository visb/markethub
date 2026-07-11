import type {
  ApiClient,
  CreateStoreClosureInput,
  StoreClosureDTO,
  StoreHoursDTO,
  StoreHoursEntryInput,
} from "@markethub/api-client";

/**
 * Módulo de API tipado do horário de funcionamento + fechamentos (story 52).
 * Toda chamada HTTP recebe o ApiClient e é tipada aqui — nunca `request`/`fetch`
 * cru em tela/hook (CLAUDE.md).
 */
export function listStoreHours(api: ApiClient, storeId: string): Promise<StoreHoursDTO[]> {
  return api.merchantStoreHours(storeId);
}

export function setStoreHours(
  api: ApiClient,
  storeId: string,
  hours: StoreHoursEntryInput[],
): Promise<StoreHoursDTO[]> {
  return api.merchantSetStoreHours(storeId, hours);
}

export function listStoreClosures(api: ApiClient, storeId: string): Promise<StoreClosureDTO[]> {
  return api.merchantStoreClosures(storeId);
}

export function addStoreClosure(
  api: ApiClient,
  storeId: string,
  input: CreateStoreClosureInput,
): Promise<StoreClosureDTO> {
  return api.merchantAddStoreClosure(storeId, input);
}

export function removeStoreClosure(
  api: ApiClient,
  storeId: string,
  closureId: string,
): Promise<{ removed: boolean }> {
  return api.merchantRemoveStoreClosure(storeId, closureId);
}
