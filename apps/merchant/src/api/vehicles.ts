import type {
  ApiClient,
  CreateVehicleInput,
  UpdateVehicleInput,
  VehicleDTO,
} from "@markethub/api-client";

/**
 * Módulo de API tipado da frota de veículos (story 14). Toda chamada HTTP recebe
 * o ApiClient e é tipada aqui — nunca `request`/`fetch` cru em tela/hook (CLAUDE.md).
 */
export function listVehicles(api: ApiClient, merchantId?: string): Promise<VehicleDTO[]> {
  return api.merchantVehicles(merchantId);
}

export function createVehicle(api: ApiClient, input: CreateVehicleInput) {
  return api.merchantCreateVehicle(input);
}

export function updateVehicle(api: ApiClient, id: string, patch: UpdateVehicleInput) {
  return api.merchantUpdateVehicle(id, patch);
}

export function removeVehicle(api: ApiClient, id: string, hard = false) {
  return api.merchantRemoveVehicle(id, hard);
}
