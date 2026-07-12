import type { ApiClient, DeliveryDTO, FailDeliveryInput, PickStore } from "@markethub/api-client";

/**
 * Módulo de API tipado das entregas do entregador (CLAUDE.md: toda chamada HTTP
 * entra aqui, tipada — nunca `request`/`fetch` cru em tela). Recebe o `ApiClient`
 * injetado via auth-context. A story 41 migra o fetch legado da home/detalhe para
 * estes hooks de React Query.
 */
export type { DeliveryDTO, FailDeliveryInput, PickStore };

export function deliveries(client: ApiClient) {
  return {
    /** Lojas às quais o entregador está vinculado. */
    stores: (): Promise<PickStore[]> => client.driverMyStores(),
    /** Entregas atribuídas ao entregador (escopo por loja quando informado). */
    mine: (storeId?: string | null): Promise<DeliveryDTO[]> =>
      client.driverDeliveries(storeId ? { storeId } : {}),
    /** Pool de entregas prontas e sem entregador (escopo por loja quando informado). */
    available: (storeId?: string | null): Promise<DeliveryDTO[]> =>
      client.driverAvailableDeliveries(storeId ? { storeId } : {}),
    /** Aceita uma entrega do pool (auto-atribuição). */
    accept: (id: string): Promise<DeliveryDTO> => client.driverAcceptDelivery(id),
    /** Coleta na loja: valida o pickupCode. */
    confirmPickup: (id: string, pickupCode: string): Promise<DeliveryDTO> =>
      client.driverConfirmPickup(id, pickupCode),
    /** Entrega ao cliente: valida o deliveryCode. */
    confirmDelivery: (id: string, deliveryCode: string): Promise<DeliveryDTO> =>
      client.driverConfirmDelivery(id, deliveryCode),
    /** Reporta falha na entrega (story 61): motivo + observação opcional. */
    fail: (id: string, body: FailDeliveryInput): Promise<DeliveryDTO> =>
      client.driverFailDelivery(id, body),
  };
}
