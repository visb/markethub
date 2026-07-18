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
 * + identificação da loja (`storeId`/`storeName`) para o badge. `distanceKm` vem
 * preenchido quando a busca leva geo; null caso contrário.
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
  distanceKm: number | null;
}
