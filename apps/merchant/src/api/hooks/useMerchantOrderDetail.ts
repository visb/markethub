import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/auth-context";
import { cancelOrderGroup, getOrderGroup } from "@/api/orders";
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
