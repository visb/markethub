import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/auth-context";
import { getMerchantContext } from "@/api/merchant";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Server-state do contexto de identidade do merchant (papel efetivo + lojas).
 * Só roda quando há usuário autenticado (`enabled`).
 */
export function useMerchantContext(options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.merchant.context,
    queryFn: () => getMerchantContext(api),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}
