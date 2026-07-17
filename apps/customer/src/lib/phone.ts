/** Utilitários de telefone BR (story 70): máscara de exibição e normalização. */

/** Remove tudo que não é dígito (formato canônico da API). */
export const onlyDigits = (value: string): string => value.replace(/\D/g, "");

/**
 * Máscara progressiva BR: `(41) 3333-4444` (fixo, 10 díg.) ou `(41) 99999-1234`
 * (celular, 11 díg.). Aceita entrada já formatada; trunca em 11 dígitos.
 */
export function formatPhoneBR(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
