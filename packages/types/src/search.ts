// Busca no marketplace (story 80): sugestões conforme digita + item do resultado.

/**
 * Sugestões de busca (`GET /search/suggest?q=`): nomes de produto que casam com o
 * termo (deduplicados) e departamentos curados que casam. `q` tem mínimo de 2
 * caracteres — abaixo disso o app nem chama. Espelha o retorno do backend
 * (services/api não importa este pacote — dois lados mantidos).
 */
export interface SearchSuggestionsDTO {
  terms: string[];
  categories: { id: string; name: string }[];
}

/**
 * Item da busca global (`GET /search` sem `storeId` — story 80): produto achatado
 * + o mesmo card de entrega do feed (story 81) — mercado (rede), frete, tempo e
 * estado (`openNow`/`paused`). `storeId`/`storeName` seguem no payload (loja
 * necessária p/ o carrinho); a UI exibe o mercado, não o nome da loja. `distanceKm`
 * vem preenchido quando a busca leva geo; null caso contrário.
 */
export interface SearchResultItemDTO {
  offerId: string;
  id: string;
  name: string;
  brand: string | null;
  packageSize: string | null;
  saleType: "unit" | "weight";
  imageUrl: string | null;
  gtin: string | null;
  category: { id: string; name: string; slug: string } | null;
  priceCents: number;
  promoPriceCents: number | null;
  storeId: string;
  storeName: string;
  /** Rede (merchant) da loja — exibida no header do card (story 81). */
  merchant: string;
  merchantLogoUrl: string | null;
  /** Taxa de entrega efetiva (story 58/81): override da loja > tarifa da rede. */
  deliveryFeeCents: number;
  /** ETA formatada ("NN min") e em minutos, iguais ao card do feed. */
  deliveryEta: string;
  etaMinutes: number;
  distanceKm: number | null;
  /** Loja aberta agora (story 52) — dirige o selo "Fechado" no card. */
  openNow: boolean;
  /** Loja em pausa temporária (story 57) — selo "Pausada" (pausa força fechado). */
  paused: boolean;
}
