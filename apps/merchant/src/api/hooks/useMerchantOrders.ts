import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ORDER_CREATED_EVENT,
  ORDER_STATUS_CHANGED_EVENT,
} from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import { listOrders } from "@/api/orders";
import { queryKeys } from "@/lib/queryKeys";

/** Intervalo de fallback (REST) quando o socket está desconectado. O socket é o
 * caminho primário; aqui só cobre o período sem conexão. */
export const FALLBACK_INTERVAL_MS = 20_000;

export interface MerchantOrdersOptions {
  /** Filtro por loja (undefined = todas as do escopo). */
  storeId?: string;
  /** Filtro por status do OrderGroup. */
  status?: string;
  /** Lojas do escopo do usuário — o efeito faz `subscribe:store` em cada uma. */
  subscribeStoreIds: string[];
  enabled?: boolean;
}

/**
 * Pedidos do merchant em tempo real (story 12). React Query é o store do
 * snapshot:
 * - load inicial = query REST (`merchant/orders`);
 * - eventos `order.created`/`order.status_changed` da store room invalidam a
 *   lista (o card muda de coluna no board);
 * - na (re)conexão, `subscribe:store` em cada loja do escopo + invalidação (cobre
 *   eventos perdidos enquanto offline);
 * - fallback: enquanto o socket estiver desconectado, refetch por intervalo;
 * - cleanup: desinscreve/desconecta no unmount.
 */
export function useMerchantOrders(options: MerchantOrdersOptions) {
  const { api, realtime, user } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  const filters = { storeId: options.storeId, status: options.status };
  const enabled = (options.enabled ?? true) && Boolean(user);

  const query = useQuery({
    queryKey: queryKeys.orders.list(filters),
    queryFn: () => listOrders(api, filters),
    enabled,
    // Fallback de polling: só quando o socket NÃO está conectado.
    refetchInterval: () => (connected ? false : FALLBACK_INTERVAL_MS),
  });

  // Chave estável p/ as deps do efeito (evita re-subscribe a cada render).
  const storeKey = [...options.subscribeStoreIds].sort().join(",");

  useEffect(() => {
    if (!enabled) return;
    const storeIds = storeKey ? storeKey.split(",") : [];

    const invalidate = () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });

    const onConnect = () => {
      setConnected(true);
      for (const id of storeIds) realtime.subscribeStore(id);
      // Re-sincroniza na (re)conexão — cobre eventos perdidos enquanto offline.
      invalidate();
    };
    const onDisconnect = () => setConnected(false);

    realtime.on(ORDER_CREATED_EVENT, invalidate);
    realtime.on(ORDER_STATUS_CHANGED_EVENT, invalidate);
    realtime.on("connect", onConnect);
    realtime.on("disconnect", onDisconnect);
    realtime.connect();
    if (realtime.connected) onConnect();

    return () => {
      realtime.disconnect();
      setConnected(false);
    };
  }, [enabled, storeKey, realtime, queryClient]);

  return {
    orders: query.data ?? [],
    loading: query.isLoading,
    connected,
  };
}
