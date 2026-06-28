import { useCallback, useMemo, useState } from "react";
import { useAddresses } from "@/api/hooks/useAddresses";
import { useDeviceLocation } from "@/api/hooks/useDeviceLocation";
import { useNearbyStores } from "@/api/hooks/useNearbyStores";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import {
  hasCoords,
  regionToBounds,
  resolveInitialRegion,
  type LatLng,
} from "@/lib/mapRegion";
import type { ViewportBoundsDTO } from "@/api/marketplace";

/** Atraso (ms) entre o fim do gesto e o fetch — evita rajada ao arrastar/zoom. */
export const VIEWPORT_DEBOUNCE_MS = 400;

/**
 * ViewModel do mapa do explore. Orquestra GPS + endereço ativo → região inicial →
 * bounds → mercados próximos. Story 06: os mercados são carregados **sob demanda
 * conforme o viewport** — `onViewportChange` (callback do mapa abstrato) atualiza
 * os `bounds` controlados; um debounce de ~400ms evita uma chamada por frame; a
 * query (`keepPreviousData`) refaz `storesNearby` com os novos bounds sem piscar
 * os pins. A tela só renderiza/encaminha o callback — sem fetch inline (CLAUDE.md).
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

  // Bounds controlados: iniciam no viewport inicial (story 05) e passam a
  // acompanhar o movimento do mapa (story 06). `null` enquanto a região inicial
  // não está pronta — `useNearbyStores` não busca sem bounds.
  const [viewportBounds, setViewportBounds] = useState<ViewportBoundsDTO | null>(null);
  const initialBounds = useMemo(() => regionToBounds(initialRegion), [initialRegion]);
  const bounds = viewportBounds ?? initialBounds;

  // Debounce antes do fetch: arrastar/zoom contínuo gera uma rajada de bounds,
  // mas só o último (estável por VIEWPORT_DEBOUNCE_MS) dispara a query.
  const debouncedBounds = useDebouncedValue(bounds, VIEWPORT_DEBOUNCE_MS);

  const onViewportChange = useCallback((next: ViewportBoundsDTO) => {
    setViewportBounds(next);
  }, []);

  const { stores, loading: storesLoading, fetching } = useNearbyStores(debouncedBounds, {
    enabled: ready,
  });

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
    // Endereço de entrega ativo (default → primeiro) p/ a barra de endereço da
    // tela montar — sem novo hook, já vem do `useAddresses` acima. Story 30.
    activeAddress,
    onViewportChange,
    // Overlay de loading da story 06: enquanto a query do viewport busca.
    fetching: ready && fetching,
    loading: !ready || storesLoading,
  };
}
