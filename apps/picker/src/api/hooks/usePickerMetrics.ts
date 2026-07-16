import { useQuery } from "@tanstack/react-query";
import type { PickerMetricsPeriodDTO } from "@markethub/api-client";
import { useAuth } from "@/auth-context";
import { picking } from "@/api/picking";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Métricas próprias do separador (story 65 — "Meu desempenho"). O período faz
 * parte da query key: trocar o chip refaz a busca. A tela só orquestra — sem
 * fetch inline (CLAUDE.md).
 */
export function usePickerMetrics(period: PickerMetricsPeriodDTO) {
  const { client } = useAuth();
  return useQuery({
    queryKey: queryKeys.pick.metrics(period),
    queryFn: () => picking(client).metrics(period),
  });
}
