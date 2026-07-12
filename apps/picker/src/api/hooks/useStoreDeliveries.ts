import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth-context";
import { storeDeliveries } from "@/api/deliveries";
import { queryKeys } from "@/lib/queryKeys";

/** Recarrega a fila a cada 10s enquanto a tela está montada. */
const POLL_MS = 10_000;

/** Fila de entregas da loja (inclui as com falha — story 61). */
export function useStoreDeliveries(storeId: string | null) {
  const { client } = useAuth();
  return useQuery({
    queryKey: queryKeys.deliveries.queue(storeId ?? ""),
    queryFn: () => storeDeliveries(client).queue(storeId as string),
    enabled: !!storeId,
    refetchInterval: POLL_MS,
  });
}

/** Entregadores vinculados à loja (para atribuição). */
export function useStoreDrivers(storeId: string | null) {
  const { client } = useAuth();
  return useQuery({
    queryKey: queryKeys.deliveries.drivers(storeId ?? ""),
    queryFn: () => storeDeliveries(client).drivers(storeId as string),
    enabled: !!storeId,
  });
}

/**
 * Ações de despacho (atribuir / desatribuir / reenviar / cancelar). Cada uma
 * invalida a fila da loja no fim (sucesso ou erro) para refletir o novo estado.
 * `retry` e `cancel` são as novas ações da story 61 sobre a entrega com falha.
 */
export function useDeliveryActions(storeId: string | null) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const api = storeDeliveries(client);

  const invalidate = () => {
    if (storeId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.deliveries.queue(storeId) });
    }
  };

  const assign = useMutation({
    mutationFn: ({ id, driverId }: { id: string; driverId: string }) => api.assign(id, driverId),
    onSettled: invalidate,
  });
  const unassign = useMutation({
    mutationFn: (id: string) => api.unassign(id),
    onSettled: invalidate,
  });
  const retry = useMutation({
    mutationFn: (id: string) => api.retry(id),
    onSettled: invalidate,
  });
  const cancel = useMutation({
    mutationFn: (orderGroupId: string) => api.cancelGroup(orderGroupId),
    onSettled: invalidate,
  });

  return { assign, unassign, retry, cancel };
}
