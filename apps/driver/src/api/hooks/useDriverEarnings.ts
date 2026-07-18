import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { DeliveryHistoryItemDTO, EarningsPeriodDTO } from "@markethub/api-client";
import { useAuth } from "@/auth-context";
import { earnings } from "@/api/earnings";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Resumo de ganhos do entregador no período (story 60). Refaz a query ao trocar de
 * período (a chave inclui o período). A tela só orquestra — sem fetch inline.
 */
export function useDriverEarnings(period: EarningsPeriodDTO) {
  const { client } = useAuth();
  return useQuery({
    queryKey: queryKeys.earnings.byPeriod(period),
    queryFn: () => earnings(client).summary(period),
  });
}

/**
 * Histórico paginado de entregas do entregador (story 60). `useInfiniteQuery`
 * acumula as páginas ("carregar mais"). Recortado pelo mesmo período dos cards
 * (story 79): o período entra na chamada e na query key — trocar de período refaz
 * a lista a partir da page 1; a paginação acumulada é preservada por período.
 */
export function useDeliveryHistory(period: EarningsPeriodDTO) {
  const { client } = useAuth();

  const query = useInfiniteQuery({
    queryKey: queryKeys.deliveries.history(period),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => earnings(client).history(pageParam, period),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const items: DeliveryHistoryItemDTO[] = (query.data?.pages ?? []).flatMap((p) => p.items);

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    hasMore: query.hasNextPage ?? false,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    isLoadingMore: query.isFetchingNextPage,
  };
}
