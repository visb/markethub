import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/auth-context";
import { cancelOrderGroup, getOrderGroup, retryDelivery } from "@/api/orders";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Detalhe de um sub-pedido (OrderGroup) para o drawer do merchant (story 54).
 * Query por id, habilitada só quando há um grupo selecionado. Encapsula a chamada
 * HTTP — a tela nunca faz fetch inline (CLAUDE.md).
 */
export function useMerchantOrderDetail(groupId: string | null) {
  const { api } = useAuth();
  return useQuery({
    queryKey: queryKeys.orders.detail(groupId ?? ""),
    queryFn: () => getOrderGroup(api, groupId as string),
    enabled: Boolean(groupId),
  });
}

/**
 * Cancela um sub-pedido (story 54). Invalida a lista (o card muda p/ "Cancelado")
 * e o detalhe do próprio grupo.
 */
export function useCancelOrderGroup(groupId: string | null) {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) => cancelOrderGroup(api, groupId as string, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      if (groupId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(groupId) });
      }
    },
  });
}

/**
 * Reenvia a entrega com falha (story 61): `failed → unassigned`, a entrega volta
 * ao pool. Invalida a lista (o card perde o destaque de falha) e o detalhe do
 * grupo. `deliveryId` vem do detalhe do sub-pedido.
 */
export function useRetryDelivery(groupId: string | null) {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) => retryDelivery(api, deliveryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      if (groupId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(groupId) });
      }
    },
  });
}
