import type { NearbyStoreDTO, ViewportBoundsDTO } from "@/api/marketplace";
import type { LatLng, MapRegion } from "@/lib/mapRegion";

/**
 * Interface única do mapa, independente de plataforma. A tela `explore` consome
 * só isto; não sabe se por baixo roda react-native-maps (nativo) ou Leaflet (web).
 */
export interface StoreMapProps {
  /** Região inicial (centro + zoom). */
  initialRegion: MapRegion;
  /** Marcadores de mercado (pin vermelho). */
  stores: NearbyStoreDTO[];
  /** Pin distinto do endereço de entrega ativo; null = não renderiza. */
  destination: LatLng | null;
  /** Tap num mercado → loja selecionada (a tela decide a navegação). */
  onStorePress?: (store: NearbyStoreDTO) => void;
  /**
   * Viewport mudou (fim do gesto): bounds já normalizados (north/south/east/west),
   * escondendo a diferença de engine — nativo deriva do `onRegionChangeComplete`
   * (centro ± deltas); web pega de `map.getBounds()` (Leaflet). Story 06.
   */
  onViewportChange?: (bounds: ViewportBoundsDTO) => void;
}
