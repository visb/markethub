import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/auth-context";
import { getAdminDashboard } from "@/api/dashboard";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Server-state do dashboard admin (story 66). Uma chamada agregadora
 * (`GET /admin/dashboard`) com auto-refresh de 60s — a home reflete a operação
 * sem F5. Só busca para usuário admin (managers são redirecionados pelo RoleHome).
 */
export function useAdminDashboard() {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.adminDashboard.summary,
    queryFn: () => getAdminDashboard(api),
    enabled: Boolean(user?.roles.includes("admin")),
    refetchInterval: 60_000,
  });
}
