import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth-context";
import { marketplace } from "@/api/marketplace";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Resumo da loja para o modal do explore (`GET /stores/:id/summary` — story 29).
 * Buscado só quando um marker é tocado: `storeId` null → não busca (`enabled`).
 * Chave em `queryKeys.explore.storeSummary(id)`.
 */
export function useStoreSummary(storeId: string | null) {
  const { api } = useAuth();
  const mkt = marketplace(api);

  const query = useQuery({
    queryKey: queryKeys.explore.storeSummary(storeId ?? ""),
    queryFn: () => mkt.storeSummary(storeId as string),
    enabled: !!storeId,
  });

  return {
    summary: query.data ?? null,
    loading: query.isLoading,
    fetching: query.isFetching,
    error: query.error,
  };
}
