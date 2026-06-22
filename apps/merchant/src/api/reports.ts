import type {
  ApiClient,
  MerchantReportQuery,
  OperationsReportDTO,
  ReviewsReportDTO,
  SalesReportDTO,
  TopProductsReportDTO,
} from "@markethub/api-client";

/**
 * Módulo de API tipado dos relatórios do merchant (story 13). Toda chamada HTTP
 * recebe o ApiClient e é tipada aqui — nunca `request`/`fetch` cru em tela/hook.
 */
export function salesReport(api: ApiClient, params: MerchantReportQuery = {}): Promise<SalesReportDTO> {
  return api.merchantSalesReport(params);
}

export function operationsReport(api: ApiClient, params: MerchantReportQuery = {}): Promise<OperationsReportDTO> {
  return api.merchantOperationsReport(params);
}

export function topProductsReport(api: ApiClient, params: MerchantReportQuery = {}): Promise<TopProductsReportDTO> {
  return api.merchantTopProductsReport(params);
}

export function reviewsReport(api: ApiClient, params: MerchantReportQuery = {}): Promise<ReviewsReportDTO> {
  return api.merchantReviewsReport(params);
}
