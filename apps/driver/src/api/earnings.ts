import type {
  ApiClient,
  DriverEarningsDTO,
  DeliveryHistoryPageDTO,
  EarningsPeriodDTO,
} from "@markethub/api-client";

/**
 * Módulo de API tipado dos ganhos/histórico do entregador (story 60). CLAUDE.md:
 * toda chamada HTTP entra aqui, tipada — nunca `request`/`fetch` cru em tela.
 * Recebe o `ApiClient` injetado via auth-context.
 */
export type { DriverEarningsDTO, DeliveryHistoryPageDTO, EarningsPeriodDTO };

export function earnings(client: ApiClient) {
  return {
    /** Resumo de ganhos (gorjetas + entregas concluídas) no período. */
    summary: (period: EarningsPeriodDTO): Promise<DriverEarningsDTO> => client.driverEarnings(period),
    /** Página do histórico de entregas concluídas/canceladas, recortada pelo período. */
    history: (page: number, period: EarningsPeriodDTO): Promise<DeliveryHistoryPageDTO> =>
      client.driverDeliveryHistory(page, period),
  };
}
