import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SUBSTITUTION_RESOLVED_EVENT, type PickItemActionInput } from "@markethub/api-client";
import { useAuth } from "@/auth-context";
import { picking } from "@/api/picking";
import { queryKeys } from "@/lib/queryKeys";

/** Tamanho mínimo do termo p/ disparar a busca de substituto. */
export const SUBSTITUTE_MIN_QUERY = 2;

/** Detalhe de uma tarefa de separação (load da tela). */
export function usePickTask(id: string) {
  const { client } = useAuth();
  return useQuery({
    queryKey: queryKeys.pick.task(id),
    queryFn: () => picking(client).task(id),
    enabled: !!id,
  });
}

/**
 * Feedback da decisão de substituição em tempo real (story 64). O backend emite
 * `substitution.resolved` na `store room` quando o cliente aprova/recusa ou a
 * política de timeout resolve. Aqui, ao receber o evento, invalida a task para
 * re-buscar o snapshot de reconciliação — o badge do item passa de "aguardando
 * cliente" a aprovada/recusada sem o separador dar refresh manual.
 *
 * Reaproveita o socket compartilhado do auth-context (mesmo do usePickQueue):
 * (re)conecta, entra na store room e re-sincroniza na reconexão.
 */
export function usePickTaskRealtime(taskId: string, storeId: string | null | undefined) {
  const { realtime } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!taskId || !storeId) return;

    const resync = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pick.task(taskId) });
    };
    const onConnect = () => {
      realtime.subscribeStore(storeId);
      resync(); // cobre eventos perdidos enquanto offline
    };

    realtime.on(SUBSTITUTION_RESOLVED_EVENT, resync);
    realtime.on("connect", onConnect);
    realtime.connect();
    if (realtime.connected) onConnect();

    return () => {
      realtime.disconnect();
    };
  }, [taskId, storeId, realtime, queryClient]);
}

/**
 * Fábrica das mutations da tela de separação. Cada uma invalida a query da task
 * no fim (sucesso ou erro) p/ re-sincronizar o snapshot — o backend dirige o status.
 */
function useTaskMutation<TVars = void>(
  id: string,
  mutationFn: (vars: TVars) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pick.task(id) });
    },
  });
}

/** Inicia a separação (assigned → picking). */
export function usePickStart(id: string) {
  const { client } = useAuth();
  return useTaskMutation(id, () => picking(client).start(id));
}

/** Marca um item como separado/recusado. */
export function usePickUpdateItem(id: string) {
  const { client } = useAuth();
  return useTaskMutation<{ itemId: string; input: PickItemActionInput }>(id, ({ itemId, input }) =>
    picking(client).updateItem(id, itemId, input),
  );
}

/** Propõe um substituto para um item. */
export function usePickSubstitute(id: string) {
  const { client } = useAuth();
  return useTaskMutation<{ itemId: string; substituteOfferId: string }>(
    id,
    ({ itemId, substituteOfferId }) => picking(client).substitute(id, itemId, substituteOfferId),
  );
}

/** Conclui a separação (picking → packed). */
export function usePickCompletePicking(id: string) {
  const { client } = useAuth();
  return useTaskMutation(id, () => picking(client).completePicking(id));
}

/** Libera para coleta — gera o código (packed → ready_for_pickup). */
export function usePickReady(id: string) {
  const { client } = useAuth();
  return useTaskMutation(id, () => picking(client).ready(id));
}

/** Confirma a entrega na retirada em loja, validando o código do cliente. */
export function useStoreHandover(id: string) {
  const { client } = useAuth();
  return useTaskMutation<{ orderGroupId: string; code: string }>(id, ({ orderGroupId, code }) =>
    picking(client).storeHandover(orderGroupId, code),
  );
}

/**
 * Autocomplete de substituto: busca ofertas da loja conforme o separador digita.
 * `query` deve vir **já debounced**. Só dispara com termo de ≥ SUBSTITUTE_MIN_QUERY
 * caracteres (gate); abaixo disso a query fica desabilitada e não chama a API.
 * `placeholderData` mantém a lista anterior enquanto o termo novo carrega (não pisca).
 */
export function useSubstituteSearch(storeId: string | undefined, query: string) {
  const { client } = useAuth();
  const q = query.trim();
  const enabled = !!storeId && q.length >= SUBSTITUTE_MIN_QUERY;
  return useQuery({
    queryKey: queryKeys.pick.search(storeId ?? "", q),
    queryFn: () => picking(client).searchOffers(storeId as string, q),
    enabled,
    placeholderData: (prev) => prev,
  });
}
