import type { ApiClient, DeliveryDTO, StoreDriverDTO } from "@markethub/api-client";

/**
 * Módulo de API tipado do despacho de entregas da loja (CLAUDE.md: toda chamada
 * HTTP entra aqui, tipada — nunca `request`/`fetch` cru em tela). Story 61 migra a
 * tela de entregas do picker (antes fetch legado via useState/useEffect) para
 * React Query e adiciona o reenvio (retry) e o cancelamento (story 54) da entrega
 * com falha.
 */
export type { DeliveryDTO, StoreDriverDTO };

export function storeDeliveries(client: ApiClient) {
  return {
    /** Fila de entregas da loja (inclui as com falha). */
    queue: (storeId: string): Promise<DeliveryDTO[]> => client.storeDeliveries(storeId),
    /** Entregadores vinculados à loja (para atribuição). */
    drivers: (storeId: string): Promise<StoreDriverDTO[]> => client.storeDrivers(storeId),
    /** Atribui um entregador à entrega. */
    assign: (id: string, driverId: string): Promise<DeliveryDTO> => client.assignDelivery(id, driverId),
    /** Desfaz a atribuição. */
    unassign: (id: string): Promise<DeliveryDTO> => client.unassignDelivery(id),
    /** Reenvia uma entrega com falha (story 61): failed → unassigned. */
    retry: (id: string): Promise<DeliveryDTO> => client.storeDeliveryRetry(id),
    /** Cancela o sub-pedido da entrega (story 54). */
    cancelGroup: (orderGroupId: string): Promise<{ id: string; status: string }> =>
      client.merchantCancelOrderGroup(orderGroupId),
  };
}
