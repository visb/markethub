import type {
  ApiClient,
  CouponDTO,
  CreateCouponInput,
  UpdateCouponInput,
} from "@markethub/api-client";

/**
 * Módulo de API tipado dos cupons da rede (story 53). Toda chamada HTTP recebe o
 * ApiClient e é tipada aqui — nunca `request`/`fetch` cru em tela/hook (CLAUDE.md).
 */
export function listCoupons(api: ApiClient, merchantId?: string): Promise<CouponDTO[]> {
  return api.merchantCoupons(merchantId);
}

export function createCoupon(api: ApiClient, input: CreateCouponInput) {
  return api.merchantCreateCoupon(input);
}

export function updateCoupon(api: ApiClient, id: string, patch: UpdateCouponInput) {
  return api.merchantUpdateCoupon(id, patch);
}

export function removeCoupon(api: ApiClient, id: string) {
  return api.merchantRemoveCoupon(id);
}
