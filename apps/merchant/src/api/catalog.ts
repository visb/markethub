import type {
  ApiClient,
  MerchantOffer,
  MerchantStock,
  PresignedUpload,
} from "@markethub/api-client";

/**
 * Módulo de API tipado do catálogo do merchant (story 11). Consome os endpoints
 * `merchant/offers`, `merchant/stocks` e `merchant/products` já existentes (S3.9/
 * S3.10). Toda chamada HTTP recebe o ApiClient e é tipada aqui — nunca
 * `request`/`fetch` cru em tela/hook (CLAUDE.md).
 */

export interface OfferFilters {
  storeId?: string;
  categoryId?: string;
  search?: string;
  available?: boolean;
}

/** Patch parcial de oferta — só o diff (campos não tocados ficam de fora). */
export interface OfferPatch {
  priceCents?: number;
  promoPriceCents?: number | null;
  available?: boolean;
}

/** Patch parcial de estoque — só o diff. */
export interface StockPatch {
  quantity?: number | null;
  available?: boolean;
}

/** Payload de criação de produto local (Product canônico + Offer/Stock na loja). */
export interface CreateProductInput {
  storeId: string;
  name: string;
  brand?: string;
  saleType?: "unit" | "weight";
  packageSize?: string;
  imageUrl?: string;
  categoryId?: string;
  gtin?: string;
  priceCents: number;
  promoPriceCents?: number | null;
  available?: boolean;
  quantity?: number | null;
}

/** Patch parcial de produto — só o diff; cada campo tocado trava (lockedFields). */
export interface UpdateProductInput {
  name?: string;
  brand?: string | null;
  saleType?: "unit" | "weight";
  packageSize?: string | null;
  imageUrl?: string | null;
  categoryId?: string | null;
}

export function listOffers(api: ApiClient, filters: OfferFilters = {}): Promise<MerchantOffer[]> {
  return api.merchantOffers(filters);
}

export function updateOffer(api: ApiClient, id: string, patch: OfferPatch) {
  return api.merchantUpdateOffer(id, patch);
}

export function unlockOfferField(api: ApiClient, id: string, field: string) {
  return api.merchantUnlockOffer(id, field);
}

export function listStocks(api: ApiClient, storeId?: string): Promise<MerchantStock[]> {
  return api.merchantStocks(storeId);
}

export function updateStock(api: ApiClient, id: string, patch: StockPatch) {
  return api.merchantUpdateStock(id, patch);
}

export function unlockStockField(api: ApiClient, id: string, field: string) {
  return api.merchantUnlockStock(id, field);
}

export function productUploadUrl(
  api: ApiClient,
  filename: string,
  contentType: string,
): Promise<PresignedUpload> {
  return api.merchantUploadUrl(filename, contentType);
}

export function createProduct(api: ApiClient, input: CreateProductInput) {
  return api.merchantCreateProduct(input as unknown as Record<string, unknown>);
}

export function updateProduct(api: ApiClient, id: string, patch: UpdateProductInput) {
  return api.merchantUpdateProduct(id, patch as unknown as Record<string, unknown>);
}
