import type { ApiClient } from "@markethub/api-client";

/** Opção mínima de rede (merchant) p/ seletor/filtro de cupons (story 53). */
export interface MerchantOption {
  id: string;
  name: string;
}

/** Lista as redes (merchants) para popular seletor/filtro. */
export function listMerchantOptions(api: ApiClient): Promise<MerchantOption[]> {
  return api.request<MerchantOption[]>("/admin/merchants", { auth: true });
}
