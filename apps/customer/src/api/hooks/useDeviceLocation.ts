import { useQuery } from "@tanstack/react-query";
import { deviceLatLng } from "@/location";
import { queryKeys } from "@/lib/queryKeys";
import type { LatLng } from "@/lib/mapRegion";

/**
 * Posição atual do dispositivo (GPS), via React Query, p/ centrar o mapa do
 * explore. Resolve para `null` se a permissão for negada (a tela cai no fallback
 * de endereço ativo / centro padrão). One-shot: sem refetch automático.
 */
export function useDeviceLocation() {
  const query = useQuery<LatLng | null>({
    queryKey: queryKeys.explore.deviceLocation,
    queryFn: () => deviceLatLng(),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return { location: query.data ?? null, resolved: query.isFetched };
}
