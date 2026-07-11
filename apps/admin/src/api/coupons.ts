import type {
  AdminCreateCouponInput,
  ApiClient,
  CouponDTO,
  UpdateCouponInput,
} from "@markethub/api-client";

/**
 * Módulo de API tipado dos cupons no admin (story 53). Toda chamada HTTP recebe o
 * ApiClient e é tipada aqui — nunca `request`/`fetch` cru em tela/hook (CLAUDE.md).
 */
export function listCoupons(api: ApiClient, filter?: string): Promise<CouponDTO[]> {
  return api.adminCoupons(filter);
}

export function createCoupon(api: ApiClient, input: AdminCreateCouponInput) {
  return api.adminCreateCoupon(input);
}

export function updateCoupon(api: ApiClient, id: string, patch: UpdateCouponInput) {
  return api.adminUpdateCoupon(id, patch);
}

export function removeCoupon(api: ApiClient, id: string) {
  return api.adminRemoveCoupon(id);
}
