/** Helpers puros de normalização de catálogo (testáveis sem DB). */

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Limpeza básica de GTIN para o sync: mantém só dígitos. Validação de dígito
 * verificador e padding completos ficam no pipeline de enriquecimento (S1.5).
 * Retorna null se não houver dígitos suficientes.
 */
export function cleanGtin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits;
}

/** Valida dígito verificador GS1 (GTIN-8/12/13/14). */
export function isValidGtin(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  if (![8, 12, 13, 14].includes(value.length)) return false;
  const digits = value.split("").map(Number);
  const check = digits.pop()!;
  let sum = 0;
  // Pesos alternam 3,1 a partir do dígito imediatamente à esquerda do verificador.
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    sum += digits[i]! * w;
  }
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Normaliza GTIN para o catálogo: limpa não-dígitos e valida o dígito verificador.
 * Retorna o GTIN limpo se válido, senão null.
 */
export function normalizeGtin(raw: string | null | undefined): string | null {
  const cleaned = cleanGtin(raw);
  if (!cleaned) return null;
  return isValidGtin(cleaned) ? cleaned : null;
}

export type SaleTypeValue = "unit" | "weight";

const BARE_WEIGHT_LABELS = ["kg", "g", "grama", "gramas", "kilo", "quilo", "kgs"];
const WEIGHT_CATEGORIES = ["acougue", "hortifruti"];

/**
 * Infere como o produto é vendido a partir do rótulo de embalagem + categoria.
 * - Rótulo "kg"/"g" puro (sem número) → vendido por peso (weight).
 * - Categoria Açougue/Hortifruti sem tamanho de embalagem → weight.
 * - Caso contrário (ex.: "2L", "380g", "1kg", embalados) → unidade (unit).
 */
export function inferSaleType(
  packageSize: string | null | undefined,
  categorySlug?: string | null,
): SaleTypeValue {
  const label = (packageSize ?? "").trim().toLowerCase();
  const hasNumber = /\d/.test(label);

  if (!hasNumber && BARE_WEIGHT_LABELS.includes(label)) return "weight";
  if (!hasNumber && categorySlug && WEIGHT_CATEGORIES.includes(categorySlug)) return "weight";
  return "unit";
}
