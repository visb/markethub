import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PICK_TASK_UPDATED_EVENT } from "@markethub/api-client";
import { useAuth } from "@/auth-context";
import { picking } from "@/api/picking";
import { queryKeys } from "@/lib/queryKeys";

/** Intervalo de fallback (REST) enquanto o socket está desconectado. O socket é
 * o caminho primário; o polling só cobre janelas de desconexão. */
const FALLBACK_INTERVAL_MS = 20_000;

/** Lojas em que o separador atua. */
export function usePickStores() {
  const { client } = useAuth();
  return useQuery({
    queryKey: queryKeys.pick.stores,
    queryFn: () => picking(client).stores(),
  });
}

/**
 * Fila de tarefas de uma loja em tempo real. React Query é o store do snapshot:
 * - load inicial = query REST (`queue`);
 * - evento `pick_task.updated` da `store room` → invalida a fila (refetch);
 * - na (re)conexão do socket → `subscribeStore` + re-sync da fila;
 * - fallback: enquanto o socket estiver desconectado, refetch por intervalo;
 * - cleanup: desinscreve/desconecta no unmount e ao trocar de loja.
 */
export function usePickQueue(storeId: string | null) {
  const { client, realtime } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  const queueQuery = useQuery({
    queryKey: queryKeys.pick.queue(storeId ?? ""),
    queryFn: () => picking(client).queue(storeId as string),
    enabled: !!storeId,
    // Fallback de polling: só quando o socket NÃO está conectado.
    refetchInterval: () => (connected ? false : FALLBACK_INTERVAL_MS),
  });

  useEffect(() => {
    if (!storeId) return;

    const onUpdated = () => {
      // Evento de mudança/chegada de tarefa → re-busca a fila (snapshot fresco).
      void queryClient.invalidateQueries({ queryKey: queryKeys.pick.queue(storeId) });
    };
    const onConnect = () => {
      setConnected(true);
      realtime.subscribeStore(storeId);
      // Re-sincroniza na (re)conexão — cobre eventos perdidos enquanto offline.
      void queryClient.invalidateQueries({ queryKey: queryKeys.pick.queue(storeId) });
    };
    const onDisconnect = () => setConnected(false);

    realtime.on(PICK_TASK_UPDATED_EVENT, onUpdated);
    realtime.on("connect", onConnect);
    realtime.on("disconnect", onDisconnect);
    realtime.connect();
    if (realtime.connected) onConnect();

    return () => {
      realtime.disconnect();
      setConnected(false);
    };
  }, [storeId, realtime, queryClient]);

  return {
    tasks: queueQuery.data ?? [],
    loading: queueQuery.isLoading,
    connected,
    refetch: () => queueQuery.refetch(),
  };
}

/** Assume uma tarefa na fila; invalida a fila da loja no fim (sucesso ou erro). */
export function usePickAssign(storeId: string | null) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => picking(client).assign(taskId),
    onSettled: () => {
      if (storeId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.pick.queue(storeId) });
      }
    },
  });
}
