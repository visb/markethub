import type { ApiClient, PickItemActionInput, PickStore, PickTaskDTO } from "@markethub/api-client";

/**
 * Módulo de API tipado do separador (CLAUDE.md: toda chamada HTTP entra aqui,
 * tipada — nunca `request`/`fetch` cru em tela). Recebe o `ApiClient` injetado
 * via auth-context e encapsula as chamadas da fila e da tela de separação.
 */
export type { PickStore, PickTaskDTO };

/** Oferta da loja retornada por `GET /search` ao propor substituto. */
export interface SubOffer {
  offerId: string;
  name: string;
  priceCents: number;
  promoPriceCents: number | null;
}

export function picking(client: ApiClient) {
  return {
    /** Lojas em que o separador atua. */
    stores: (): Promise<PickStore[]> => client.pickStores(),
    /** Fila de tarefas (queued/assigned/...) de uma loja. */
    queue: (storeId: string): Promise<PickTaskDTO[]> => client.pickQueue(storeId),
    /** Assume uma tarefa na fila (queued → assigned). */
    assign: (taskId: string): Promise<PickTaskDTO> => client.pickAssign(taskId),
    /** Detalhe de uma tarefa de separação. */
    task: (id: string): Promise<PickTaskDTO> => client.pickTask(id),
    /** Inicia a separação (assigned → picking). */
    start: (id: string): Promise<PickTaskDTO> => client.pickStart(id),
    /** Marca um item como separado/recusado. */
    updateItem: (id: string, itemId: string, input: PickItemActionInput): Promise<unknown> =>
      client.pickUpdateItem(id, itemId, input),
    /** Propõe um substituto para um item (cliente aprova no app dele). */
    substitute: (id: string, itemId: string, substituteOfferId: string): Promise<unknown> =>
      client.pickSubstitute(id, itemId, substituteOfferId),
    /** Conclui a separação (picking → packed). */
    completePicking: (id: string): Promise<PickTaskDTO> => client.pickCompletePicking(id),
    /** Libera para coleta — gera o código (packed → ready_for_pickup). */
    ready: (id: string): Promise<PickTaskDTO> => client.pickReady(id),
    /** Confirma a entrega na retirada em loja, validando o código do cliente. */
    storeHandover: (orderGroupId: string, code: string): Promise<unknown> =>
      client.storeHandover(orderGroupId, code),
    /** Busca ofertas da mesma loja p/ propor substituto (autocomplete). */
    searchOffers: async (storeId: string, q: string): Promise<SubOffer[]> => {
      const r = await client.request<{ items: SubOffer[] }>(
        `/search?storeId=${encodeURIComponent(storeId)}&q=${encodeURIComponent(q)}`,
      );
      return r.items;
    },
  };
}
