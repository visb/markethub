import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth-context";
import { marketplace, type StoreReviewDTO } from "@/api/marketplace";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Vitrine pública paginada das avaliações da rede (story 56). `useInfiniteQuery`
 * acumula as páginas ("ver mais"); `average`/`count` vêm da primeira página. A
 * tela só orquestra — sem fetch inline. `enabled` evita disparar sem merchantId.
 */
export function useStoreReviews(merchantId: string | undefined) {
  const { api } = useAuth();
  const mkt = marketplace(api);

  const query = useInfiniteQuery({
    queryKey: queryKeys.storeReviews.byMerchant(merchantId ?? ""),
    enabled: Boolean(merchantId),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => mkt.storeReviews(merchantId as string, pageParam),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.count ? last.page + 1 : undefined,
  });

  const pages = query.data?.pages ?? [];
  const first = pages[0];
  const items: StoreReviewDTO[] = pages.flatMap((p) => p.items);

  return {
    items,
    average: first?.average ?? 0,
    count: first?.count ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    hasMore: query.hasNextPage ?? false,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    isLoadingMore: query.isFetchingNextPage,
  };
}
