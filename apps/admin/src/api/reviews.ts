import type { AdminReviewDTO, AdminReviewsFilter, ApiClient } from "@markethub/api-client";

/**
 * Módulo de API tipado da moderação de avaliações no admin (story 68). Toda
 * chamada HTTP recebe o ApiClient e é tipada aqui — nunca `request`/`fetch`
 * cru em tela/hook (CLAUDE.md).
 */
export function listAdminReviews(
  api: ApiClient,
  filter: AdminReviewsFilter = {},
): Promise<AdminReviewDTO[]> {
  return api.adminReviews(filter);
}

/** Soft-hide reversível — motivo obrigatório; o autor não é notificado. */
export function hideReview(api: ApiClient, id: string, reason: string): Promise<AdminReviewDTO> {
  return api.adminHideReview(id, reason);
}

export function unhideReview(api: ApiClient, id: string): Promise<AdminReviewDTO> {
  return api.adminUnhideReview(id);
}
