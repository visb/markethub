// Ganhos (gorjetas) e histórico de entregas do entregador (story 60)
//
// No modelo own-store o entregador é staff da loja: não há repasse por corrida na
// plataforma, então o único ganho registrado é a GORJETA (Tip). Gorjeta conta quando
// `status = paid`; a pendente aparece separada (não soma).

/** Janelas fixas de agregação dos ganhos (sem range custom). */
export type EarningsPeriodDTO = "today" | "7d" | "30d";

/** Resumo de ganhos do entregador no período selecionado. */
export interface DriverEarningsDTO {
  period: EarningsPeriodDTO;
  /** Soma das gorjetas pagas (status=paid) no período — o "recebido". */
  tipsPaidCents: number;
  /** Nº de gorjetas pagas no período. */
  tipsPaidCount: number;
  /** Soma das gorjetas ainda pendentes (status=pending) no período — separada, não somada. */
  tipsPendingCents: number;
  /** Nº de entregas concluídas (delivered) no período. */
  deliveriesCompleted: number;
}

/** Gorjeta anexada a uma entrega do histórico (quando o pedido teve gorjeta ao entregador). */
export interface DeliveryHistoryTipDTO {
  amountCents: number;
  status: "pending" | "paid" | "failed";
}

/** Uma entrega concluída/cancelada no histórico do entregador. */
export interface DeliveryHistoryItemDTO {
  id: string;
  orderId: string;
  status: "delivered" | "canceled";
  storeName: string;
  /** Bairro/cidade do destino (snapshot do endereço do pedido), quando disponível. */
  destinationArea?: string;
  /** Data/hora de referência (entregue: deliveredAt; cancelada: quando foi cancelada). */
  date: string;
  /** Gorjeta do pedido, quando houve gorjeta para este entregador. */
  tip?: DeliveryHistoryTipDTO;
}

/** Página do histórico de entregas (paginação "carregar mais"). */
export interface DeliveryHistoryPageDTO {
  items: DeliveryHistoryItemDTO[];
  page: number;
  pageSize: number;
  /** Há mais páginas após esta. */
  hasMore: boolean;
}
