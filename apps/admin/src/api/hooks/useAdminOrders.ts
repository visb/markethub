import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/auth-context";
import {
  cancelAdminOrder,
  getAdminOrder,
  getAdminOrderTimeline,
  listAdminOrders,
  refundAdminOrder,
  type AdminManualRefundInput,
  type AdminOrdersFilter,
} from "@/api/orders";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Server-state dos pedidos no admin (story 67): lista com busca do suporte,
 * detalhe profundo, timeline e ações (cancelar / reembolso manual). Telas só
 * orquestram — sem fetch inline (CLAUDE.md). As mutations invalidam o recurso
 * inteiro (lista + detalhe + timeline) — o cancelamento/reembolso muda os três.
 */
export function useAdminOrders(filter: AdminOrdersFilter) {
  const { api } = useAuth();
  return useQuery({
    queryKey: queryKeys.adminOrders.list(filter),
    queryFn: () => listAdminOrders(api, filter),
  });
}

export function useAdminOrder(id: string) {
  const { api } = useAuth();
  return useQuery({
    queryKey: queryKeys.adminOrders.detail(id),
    queryFn: () => getAdminOrder(api, id),
    enabled: Boolean(id),
  });
}

export function useAdminOrderTimeline(id: string) {
  const { api } = useAuth();
  return useQuery({
    queryKey: queryKeys.adminOrders.timeline(id),
    queryFn: () => getAdminOrderTimeline(api, id),
    enabled: Boolean(id),
  });
}

function useInvalidateAdminOrders() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.adminOrders.all });
}

export function useCancelAdminOrder(id: string) {
  const { api } = useAuth();
  const invalidate = useInvalidateAdminOrders();
  return useMutation({
    mutationFn: (input: { reason?: string }) => cancelAdminOrder(api, id, input.reason),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useManualRefund(id: string) {
  const { api } = useAuth();
  const invalidate = useInvalidateAdminOrders();
  return useMutation({
    mutationFn: (input: AdminManualRefundInput) => refundAdminOrder(api, id, input),
    onSuccess: () => {
      void invalidate();
    },
  });
}
