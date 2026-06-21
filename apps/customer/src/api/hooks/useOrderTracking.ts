import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ORDER_UPDATED_EVENT } from "@markethub/api-client";
import { useAuth } from "@/auth-context";
import { marketplace, type OrderTracking, type SubstitutionView } from "@/api/marketplace";
import { queryKeys } from "@/lib/queryKeys";

/** Intervalo de fallback (REST) quando o socket está desconectado. Mais espaçado
 * que os 8s do polling antigo — o socket é o caminho primário. */
const FALLBACK_INTERVAL_MS = 20_000;

const TERMINAL = ["delivered", "canceled"];
const isTerminal = (status?: string) => !!status && TERMINAL.includes(status);

/**
 * Rastreio do pedido em tempo real. React Query é o store do snapshot:
 * - load inicial = query REST (`tracking`);
 * - evento `order.updated` do socket faz `setQueryData` (sem round-trip REST);
 * - fallback: enquanto o socket estiver desconectado, refetch por intervalo espaçado;
 * - cleanup: desinscreve/desconecta no unmount e em estado terminal.
 */
export function useOrderTracking(id: string) {
  const { api, realtime } = useAuth();
  const mkt = marketplace(api);
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  const trackingQuery = useQuery({
    queryKey: queryKeys.tracking.order(id),
    queryFn: () => mkt.tracking(id),
    enabled: !!id,
    // Fallback de polling: só quando o socket NÃO está conectado e o pedido não terminou.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (isTerminal(status)) return false;
      return connected ? false : FALLBACK_INTERVAL_MS;
    },
  });

  const tracking = trackingQuery.data ?? null;
  // Substituições pendentes só fazem sentido durante a separação (mesmo padrão React Query).
  const hasPending = !!tracking?.groups.some((g) => (g.picking?.toApprove ?? 0) > 0);
  const substitutionsQuery = useQuery({
    queryKey: queryKeys.tracking.substitutions(id),
    queryFn: () => mkt.substitutions(id),
    enabled: !!id && hasPending,
    refetchInterval: () => {
      if (isTerminal(tracking?.status)) return false;
      return connected ? false : FALLBACK_INTERVAL_MS;
    },
  });

  const terminal = isTerminal(tracking?.status);
  // Só conecta o socket depois do load inicial e enquanto o pedido não terminou —
  // evita abrir conexão para um pedido já entregue/cancelado.
  const shouldConnect = trackingQuery.isSuccess && !terminal;

  const refreshAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.tracking.order(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tracking.substitutions(id) }),
    ]);

  const decideMutation = useMutation({
    mutationFn: ({ subId, approve }: { subId: string; approve: boolean }) =>
      approve ? mkt.approveSubstitution(id, subId) : mkt.rejectSubstitution(id, subId),
    onSuccess: refreshAll,
  });

  const cancelMutation = useMutation({
    mutationFn: () => mkt.cancelOrder(id),
    onSuccess: refreshAll,
  });

  useEffect(() => {
    if (!id || !shouldConnect) return;

    const onUpdated = (payload: unknown) => {
      // O payload de order.updated É o snapshot de OrderTracking — aplica direto.
      queryClient.setQueryData(queryKeys.tracking.order(id), payload as OrderTracking);
    };
    const onConnect = () => {
      setConnected(true);
      realtime.subscribeOrder(id);
      // Re-sincroniza na (re)conexão — cobre eventos perdidos enquanto offline.
      void queryClient.invalidateQueries({ queryKey: queryKeys.tracking.order(id) });
    };
    const onDisconnect = () => setConnected(false);

    realtime.on(ORDER_UPDATED_EVENT, onUpdated);
    realtime.on("connect", onConnect);
    realtime.on("disconnect", onDisconnect);
    realtime.connect();
    if (realtime.connected) onConnect();

    return () => {
      realtime.disconnect();
      setConnected(false);
    };
  }, [id, shouldConnect, realtime, queryClient]);

  return {
    tracking,
    substitutions: (substitutionsQuery.data ?? []) as SubstitutionView[],
    loading: trackingQuery.isLoading,
    connected,
    busy: decideMutation.isPending || cancelMutation.isPending,
    decideSubstitution: (subId: string, approve: boolean) =>
      decideMutation.mutateAsync({ subId, approve }),
    cancelOrder: () => cancelMutation.mutateAsync(),
  };
}
