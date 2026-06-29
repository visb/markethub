import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DeliveryDTO } from "@markethub/api-client";
import { useAuth } from "@/auth-context";
import { deliveries } from "@/api/deliveries";
import { queryKeys } from "@/lib/queryKeys";

/** Recarrega a fila a cada 10s enquanto a tela está montada (substitui o setInterval legado). */
const POLL_MS = 10_000;

/** Lojas às quais o entregador está vinculado. */
export function useDriverStores() {
  const { client } = useAuth();
  return useQuery({
    queryKey: queryKeys.deliveries.stores,
    queryFn: () => deliveries(client).stores(),
  });
}

/** Entregas atribuídas ao entregador no escopo da loja (null = todas). */
export function useDriverDeliveries(storeId: string | null, options?: { enabled?: boolean }) {
  const { client } = useAuth();
  return useQuery({
    queryKey: queryKeys.deliveries.mine(storeId),
    queryFn: () => deliveries(client).mine(storeId),
    enabled: options?.enabled ?? true,
    refetchInterval: POLL_MS,
  });
}

/** Pool de entregas disponíveis para aceitar no escopo da loja (null = todas). */
export function useAvailableDeliveries(storeId: string | null, options?: { enabled?: boolean }) {
  const { client } = useAuth();
  return useQuery({
    queryKey: queryKeys.deliveries.available(storeId),
    queryFn: () => deliveries(client).available(storeId),
    enabled: options?.enabled ?? true,
    refetchInterval: POLL_MS,
  });
}

/**
 * Aceita uma entrega do pool. Ao concluir, invalida todas as queries de entrega
 * (minhas + pool + lojas) para refletir a auto-atribuição imediatamente.
 */
export function useAcceptDelivery() {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<DeliveryDTO, unknown, string>({
    mutationFn: (id: string) => deliveries(client).accept(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.deliveries.root });
    },
  });
}

/** Detalhe de uma entrega: derivado da lista atribuída (sem endpoint de detalhe). */
export function useDeliveryDetail(id: string) {
  const { client } = useAuth();
  return useQuery({
    queryKey: queryKeys.deliveries.detail(id),
    queryFn: async () => {
      const list = await deliveries(client).mine(null);
      return list.find((d) => d.id === id) ?? null;
    },
    enabled: !!id,
  });
}

/** Confirma a coleta na loja; escreve a entrega atualizada no cache do detalhe. */
export function useConfirmPickup(id: string) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<DeliveryDTO, unknown, string>({
    mutationFn: (pickupCode: string) => deliveries(client).confirmPickup(id, pickupCode),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.deliveries.detail(id), updated);
    },
  });
}

/** Confirma a entrega ao cliente; escreve a entrega atualizada no cache do detalhe. */
export function useConfirmDelivery(id: string) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<DeliveryDTO, unknown, string>({
    mutationFn: (deliveryCode: string) => deliveries(client).confirmDelivery(id, deliveryCode),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.deliveries.detail(id), updated);
    },
  });
}
