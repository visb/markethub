import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth-context";
import { marketplace, type GeoQuery, type SearchResultItemDTO } from "@/api/marketplace";
import { queryKeys } from "@/lib/queryKeys";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useAddresses } from "@/api/hooks/useAddresses";
import { getRadiusKm, RADIUS_DEFAULT } from "@/prefs";

/** Termo tem mínimo de 2 caracteres para disparar sugestões/busca (story 80). */
const MIN_QUERY = 2;

/**
 * Recorte geo da busca global (story 80): endereço ativo + raio escolhido — o
 * mesmo usado pela home. Sem endereço com coordenadas → undefined (busca sem
 * filtro de distância). O raio (pref local) vem por query p/ a tela não ler
 * storage inline.
 */
export function useSearchGeo(): GeoQuery | undefined {
  const { activeAddress } = useAddresses();
  const { data: radiusKm } = useQuery({
    queryKey: queryKeys.prefs.radiusKm,
    queryFn: () => getRadiusKm(),
  });

  if (activeAddress?.latitude == null || activeAddress.longitude == null) return undefined;
  return {
    lat: activeAddress.latitude,
    lng: activeAddress.longitude,
    radiusKm: radiusKm ?? RADIUS_DEFAULT,
  };
}

/**
 * Sugestões conforme digita (story 80): `GET /search/suggest`. Debounce evita uma
 * chamada por tecla; `enabled` só dispara com termo estável de ≥ 2 caracteres. A
 * tela só orquestra — sem fetch inline.
 */
export function useSearchSuggestions(q: string) {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const term = useDebouncedValue(q.trim(), 250);
  const enabled = term.length >= MIN_QUERY;

  const query = useQuery({
    queryKey: queryKeys.search.suggestions(term),
    queryFn: () => mkt.searchSuggest(term),
    enabled,
  });

  return {
    terms: query.data?.terms ?? [],
    categories: query.data?.categories ?? [],
    isLoading: enabled && query.isLoading,
  };
}

/**
 * Busca global paginada (story 80): produtos de todas as lojas próximas (mesmo
 * recorte geo da home). `useInfiniteQuery` acumula as páginas ("carregar mais").
 * `enabled` evita disparar sem termo de ≥ 2 caracteres.
 */
export function useProductSearch(q: string, geo?: GeoQuery) {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const term = q.trim();
  const enabled = term.length >= MIN_QUERY;

  const query = useInfiniteQuery({
    queryKey: queryKeys.search.results(term, geo),
    enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => mkt.searchGlobal(term, { geo, page: pageParam }),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });

  const pages = query.data?.pages ?? [];
  const items: SearchResultItemDTO[] = pages.flatMap((p) => p.items);

  return {
    items,
    total: pages[0]?.total ?? 0,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    hasMore: query.hasNextPage ?? false,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    isLoadingMore: query.isFetchingNextPage,
  };
}
