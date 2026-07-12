import type { ApiClient, MerchantReviewDTO, MerchantReviewsFilter } from "@markethub/api-client";

/**
 * Módulo de API tipado das avaliações da rede (story 56). Toda chamada HTTP
 * recebe o ApiClient e é tipada aqui — nunca `request`/`fetch` cru em tela/hook
 * (CLAUDE.md).
 */
export function listReviews(
  api: ApiClient,
  filter: MerchantReviewsFilter = {},
): Promise<MerchantReviewDTO[]> {
  return api.merchantReviews(filter);
}

export function replyReview(api: ApiClient, id: string, text: string): Promise<MerchantReviewDTO> {
  return api.merchantReplyReview(id, text);
}
