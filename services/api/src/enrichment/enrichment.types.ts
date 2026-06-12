/** Resultado normalizado de um provider de enriquecimento (ex.: Cosmos). */
export interface EnrichmentResult {
  gtin: string;
  name?: string | null;
  brand?: string | null;
  imageUrl?: string | null;
  unit?: string | null;
  ncm?: string | null;
  gpc?: string | null;
  /** Texto da categoria de origem usado no mapeamento → Category da plataforma. */
  cosmosCategory?: string | null;
  /** Payload cru para auditoria/cache. */
  raw: unknown;
}
