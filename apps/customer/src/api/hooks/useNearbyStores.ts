import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth-context";
import { marketplace, type ViewportBoundsDTO } from "@/api/marketplace";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Mercados dentro do viewport do mapa (`GET /stores/nearby`). Fonte dos marcadores
 * do explore. `bounds` null = sem viewport ainda → não busca (respeita `enabled`);
 * a recarga conforme o mapa se move é da story 06.
 */
export function useNearbyStores(
  bounds: ViewportBoundsDTO | null,
  options?: { enabled?: boolean },
) {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const enabled = (options?.enabled ?? true) && !!bounds;

  const query = useQuery({
    queryKey: queryKeys.explore.nearby(bounds ?? { north: 0, south: 0, east: 0, west: 0 }),
    queryFn: () => mkt.storesNearby(bounds as ViewportBoundsDTO),
    enabled,
  });

  return { stores: query.data ?? [], loading: query.isLoading, error: query.error };
}
