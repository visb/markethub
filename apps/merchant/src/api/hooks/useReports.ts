import { useQuery } from "@tanstack/react-query";
import type { MerchantReportQuery } from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import { operationsReport, pickersReport, reviewsReport, salesReport, topProductsReport } from "@/api/reports";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Server-state dos relatórios (story 13). Os filtros (período/loja) entram na
 * query key — mudar o filtro refaz a busca. Telas só orquestram, sem fetch
 * inline. O escopo (lojas/rede) é reforçado no backend.
 */
export function useSalesReport(filters: MerchantReportQuery, options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.reports.sales(filters),
    queryFn: () => salesReport(api, filters),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}

export function useOperationsReport(filters: MerchantReportQuery, options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.reports.operations(filters),
    queryFn: () => operationsReport(api, filters),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}

export function useTopProductsReport(filters: MerchantReportQuery, options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.reports.topProducts(filters),
    queryFn: () => topProductsReport(api, filters),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}

export function useReviewsReport(filters: MerchantReportQuery, options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.reports.reviews(filters),
    queryFn: () => reviewsReport(api, filters),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}

/** Separação por colaborador (story 65) — respeita o mesmo filtro período/loja. */
export function usePickersReport(filters: MerchantReportQuery, options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.reports.pickers(filters),
    queryFn: () => pickersReport(api, filters),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}
