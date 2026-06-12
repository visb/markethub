import { randomInt } from "node:crypto";

/**
 * Código numérico curto e legível para liberação de coleta/entrega (SF.1).
 * Padrão 4 dígitos (ex.: "0427"). Curto o bastante p/ digitar; não é segredo
 * forte — a validação tem limite de tentativas (anti-brute-force) na Fase 4.
 */
export function shortCode(digits = 4): string {
  const max = 10 ** digits;
  return String(randomInt(0, max)).padStart(digits, "0");
}
