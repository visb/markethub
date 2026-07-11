import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/auth-context";
import { listMerchantOptions } from "@/api/merchants";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Redes (merchants) para o seletor/filtro de cupons (story 53). Server-state via
 * React Query; a lista é estável, então não precisa refetch agressivo.
 */
export function useMerchantOptions() {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.merchantOptions.all,
    queryFn: () => listMerchantOptions(api),
    enabled: Boolean(user),
  });
}
