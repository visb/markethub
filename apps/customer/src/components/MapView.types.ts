import type { NearbyStoreDTO } from "@/api/marketplace";
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
}
