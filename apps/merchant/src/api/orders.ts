import type { ApiClient, MerchantOrderDTO } from "@markethub/api-client";

/**
 * Módulo de API tipado dos pedidos do merchant (story 12). Toda chamada HTTP
 * recebe o ApiClient e é tipada aqui — nunca `request`/`fetch` cru em tela/hook.
 */
export function listOrders(
  api: ApiClient,
  filters: { storeId?: string; status?: string } = {},
): Promise<MerchantOrderDTO[]> {
  return api.merchantOrders(filters);
}
