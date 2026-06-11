/**
 * Área de cobertura do lançamento (S6.3): Curitiba e municípios limítrofes
 * (fonte: Wikipédia/IBGE — divisas de Curitiba).
 */
export interface CoveredCity {
  city: string;
  state: string;
}

export const COVERED_CITIES: CoveredCity[] = [
  { city: "Curitiba", state: "PR" },
  { city: "Almirante Tamandaré", state: "PR" },
  { city: "Colombo", state: "PR" },
  { city: "Pinhais", state: "PR" },
  { city: "São José dos Pinhais", state: "PR" },
  { city: "Fazenda Rio Grande", state: "PR" },
  { city: "Araucária", state: "PR" },
  { city: "Campo Largo", state: "PR" },
  { city: "Campo Magro", state: "PR" },
];

/** Normaliza p/ comparação: sem acentos, sem caixa, espaços colapsados. */
export function normalizeCity(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const INDEX = new Set(COVERED_CITIES.map((c) => `${normalizeCity(c.city)}|${c.state.toUpperCase()}`));

export function isCityCovered(city: string, state: string): boolean {
  return INDEX.has(`${normalizeCity(city)}|${state.toUpperCase().trim()}`);
}
