import type { ApiClient, MerchantOrderDetailDTO, MerchantOrderDTO } from "@markethub/api-client";

/**
 * Módulo de API tipado dos pedidos do merchant (story 12 / 54). Toda chamada HTTP
 * recebe o ApiClient e é tipada aqui — nunca `request`/`fetch` cru em tela/hook.
 */
export function listOrders(
  api: ApiClient,
  filters: { storeId?: string; status?: string } = {},
): Promise<MerchantOrderDTO[]> {
  return api.merchantOrders(filters);
}

/** Detalhe de um sub-pedido (OrderGroup) — story 54. */
export function getOrderGroup(api: ApiClient, id: string): Promise<MerchantOrderDetailDTO> {
  return api.merchantOrderGroup(id);
}

/** Cancela um sub-pedido (motivo opcional) — story 54. */
export function cancelOrderGroup(
  api: ApiClient,
  id: string,
  reason?: string,
): Promise<{ id: string; status: string }> {
  return api.merchantCancelOrderGroup(id, reason);
}
