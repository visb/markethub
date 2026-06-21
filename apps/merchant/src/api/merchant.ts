import type { ApiClient, MerchantContextDTO } from "@markethub/api-client";

/**
 * Módulo de API tipado do app merchant (CLAUDE.md): toda chamada HTTP recebe o
 * ApiClient e é tipada aqui — nunca `request`/`fetch` cru em tela/hook.
 */
export function getMerchantContext(api: ApiClient): Promise<MerchantContextDTO> {
  return api.merchantContext();
}
