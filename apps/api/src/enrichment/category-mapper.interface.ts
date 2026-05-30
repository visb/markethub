/** Mapeia categoria de origem (Cosmos) → Category da plataforma. */
export interface CategoryMapper {
  readonly name: string;
  /** Retorna slug da categoria-alvo + confiança [0..1], ou null se indefinido. */
  classify(sourceKey: string): Promise<{ slug: string; confidence: number } | null>;
}

export const CATEGORY_MAPPER = Symbol("CATEGORY_MAPPER");
