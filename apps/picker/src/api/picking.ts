import type { ApiClient, PickStore, PickTaskDTO } from "@markethub/api-client";

/**
 * Módulo de API tipado do separador (CLAUDE.md: toda chamada HTTP entra aqui,
 * tipada — nunca `request`/`fetch` cru em tela). Recebe o `ApiClient` injetado
 * via auth-context e encapsula as chamadas da fila de separação.
 */
export type { PickStore, PickTaskDTO };

export function picking(client: ApiClient) {
  return {
    /** Lojas em que o separador atua. */
    stores: (): Promise<PickStore[]> => client.pickStores(),
    /** Fila de tarefas (queued/assigned/...) de uma loja. */
    queue: (storeId: string): Promise<PickTaskDTO[]> => client.pickQueue(storeId),
    /** Assume uma tarefa na fila (queued → assigned). */
    assign: (taskId: string): Promise<PickTaskDTO> => client.pickAssign(taskId),
  };
}
