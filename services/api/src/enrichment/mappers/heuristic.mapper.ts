import { Injectable } from "@nestjs/common";
import { slugify } from "../../shared/catalog-normalize";
import type { CategoryMapper } from "../category-mapper.interface";

interface Rule {
  slug: string;
  keywords: string[];
}

// Regras keyword → categoria canônica (slugs do seed). Ordem = prioridade.
const RULES: Rule[] = [
  { slug: "acougue", keywords: ["carne", "bovin", "frango", "suin", "aves", "linguica", "acougue"] },
  {
    slug: "hortifruti",
    keywords: ["fruta", "legume", "verdura", "hortifruti", "banana", "tomate", "batata"],
  },
  { slug: "padaria", keywords: ["padaria", "pao", "bolo", "biscoito", "torta", "panific"] },
  {
    slug: "bebidas",
    keywords: ["bebida", "refrigerante", "leite", "cerveja", "suco", "agua", "vinho", "cafe", "cha"],
  },
  { slug: "mercearia", keywords: ["acucar", "arroz", "feijao", "oleo", "massa", "mercearia", "sal"] },
];

/**
 * Mapeador heurístico (string match) — default até plugar IA (Claude).
 * Mesma interface do futuro AiCategoryMapper.
 */
@Injectable()
export class HeuristicCategoryMapper implements CategoryMapper {
  readonly name = "heuristic";

  classify(sourceKey: string): Promise<{ slug: string; confidence: number } | null> {
    const norm = slugify(sourceKey).replace(/-/g, " ");
    for (const rule of RULES) {
      if (rule.keywords.some((k) => norm.includes(k))) {
        return Promise.resolve({ slug: rule.slug, confidence: 0.8 });
      }
    }
    // Fallback de baixa confiança → revisão manual.
    return Promise.resolve({ slug: "mercearia", confidence: 0.3 });
  }
}
