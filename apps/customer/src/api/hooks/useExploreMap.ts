import { useMemo } from "react";
import { useAddresses } from "@/api/hooks/useAddresses";
import { useDeviceLocation } from "@/api/hooks/useDeviceLocation";
import { useNearbyStores } from "@/api/hooks/useNearbyStores";
import {
  hasCoords,
  regionToBounds,
  resolveInitialRegion,
  type LatLng,
} from "@/lib/mapRegion";

/**
 * ViewModel do mapa do explore (story 05). Orquestra GPS + endereço ativo →
 * região inicial → bounds → mercados próximos. A tela só renderiza o resultado;
 * sem lógica de fetch inline (CLAUDE.md). A recarga por viewport é da story 06 —
 * aqui a busca é única, sobre os bounds do `initialRegion`.
 */
export function useExploreMap() {
  const { location: gps, resolved: gpsResolved } = useDeviceLocation();
  const { activeAddress, loading: addressesLoading } = useAddresses();

  // Só calcula a região quando o GPS já resolveu (concedido OU negado) e os
  // endereços carregaram — evita centrar no default e depois saltar.
  const ready = gpsResolved && !addressesLoading;

  const initialRegion = useMemo(
    () => resolveInitialRegion({ gps, activeAddress }),
    [gps, activeAddress],
  );

  const bounds = useMemo(() => regionToBounds(initialRegion), [initialRegion]);

  const { stores, loading: storesLoading } = useNearbyStores(bounds, { enabled: ready });

  // Pin de destino só quando o endereço ativo tem lat/lng (faceta 3).
  const destination: LatLng | null =
    activeAddress && hasCoords(activeAddress)
      ? { latitude: activeAddress.latitude as number, longitude: activeAddress.longitude as number }
      : null;

  return {
    ready,
    initialRegion,
    stores,
    destination,
    loading: !ready || storesLoading,
  };
}
