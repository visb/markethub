import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth-context";
import { marketplace, type TipItemInput, type TipTargets, type TipView } from "@/api/marketplace";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Gorjeta individual por alvo (story 77). React Query é o store:
 * - `targets`: alvos possíveis do pedido (entregador? mercados?) p/ montar as linhas;
 * - `tip`: a gorjeta já criada (null enquanto não existe — 404 vira null);
 * - `createTip`: cria a cobrança PIX única do total e cacheia o Tip;
 * - `payTip`: simula o pagamento (provider mock) e revalida o Tip.
 */
export function useTip(orderId: string) {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const queryClient = useQueryClient();

  const targetsQuery = useQuery<TipTargets>({
    queryKey: queryKeys.tip.targets(orderId),
    queryFn: () => mkt.tipTargets(orderId),
    enabled: !!orderId,
  });

  const tipQuery = useQuery<TipView | null>({
    queryKey: queryKeys.tip.view(orderId),
    // Sem gorjeta ainda → 404; tratamos como "sem gorjeta" (null), não como erro.
    queryFn: () => mkt.tip(orderId).catch(() => null),
    enabled: !!orderId,
  });

  const createMutation = useMutation({
    mutationFn: (items: TipItemInput[]) => mkt.createTip(orderId, items),
    onSuccess: (tip) => queryClient.setQueryData(queryKeys.tip.view(orderId), tip),
  });

  const payMutation = useMutation({
    mutationFn: () => mkt.mockPayTip(orderId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.tip.view(orderId) }),
  });

  return {
    targets: targetsQuery.data ?? null,
    tip: tipQuery.data ?? null,
    loading: targetsQuery.isLoading,
    busy: createMutation.isPending || payMutation.isPending,
    createTip: (items: TipItemInput[]) => createMutation.mutateAsync(items),
    payTip: () => payMutation.mutateAsync(),
  };
}
