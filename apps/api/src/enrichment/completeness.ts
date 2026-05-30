/** Cálculo puro do score de completude (0-100) de um produto. */

export interface CompletenessInput {
  name: boolean;
  gtin: boolean;
  brand: boolean;
  imageUrl: boolean;
  unit: boolean;
  category: boolean;
}

const WEIGHTS: Record<keyof CompletenessInput, number> = {
  name: 25,
  imageUrl: 20,
  brand: 15,
  gtin: 15,
  category: 15,
  unit: 10,
};

export function completenessScore(input: CompletenessInput): number {
  let score = 0;
  for (const key of Object.keys(WEIGHTS) as (keyof CompletenessInput)[]) {
    if (input[key]) score += WEIGHTS[key];
  }
  return score;
}
