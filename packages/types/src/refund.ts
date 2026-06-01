// Reembolso — SF.3 (falta de peso / item recusado)

export type RefundStatusDTO = 'pending' | 'processed' | 'failed';

export type RefundReasonDTO = 'weight_shortfall' | 'refused';

export interface RefundComponentDTO {
  orderGroupId: string;
  amountCents: number;
  reason: RefundReasonDTO;
}

export interface RefundDTO {
  id: string;
  orderId: string;
  amountCents: number;
  status: RefundStatusDTO;
  reason: string;
  components: RefundComponentDTO[];
  createdAt: string;
  processedAt?: string;
}
