// Picking / Separação — Fase 3 (S3.1)

export type PickTaskStatusDTO =
  | 'queued'
  | 'assigned'
  | 'picking'
  | 'packed'
  | 'ready_for_pickup';

export type PickItemStatusDTO = 'pending' | 'picked' | 'refused' | 'substituted';

export type SubstitutionStatusDTO = 'pending' | 'approved' | 'rejected';

export interface SubstitutionDTO {
  id: string;
  substituteOfferId?: string;
  substituteProductId?: string;
  nameSnapshot: string;
  unitPriceCents: number;
  priceDiffCents: number;
  approvalStatus: SubstitutionStatusDTO;
  resolvedAt?: string;
}

export interface PickItemDTO {
  id: string;
  orderItemId: string;
  nameSnapshot: string;
  saleType: 'unit' | 'weight';
  status: PickItemStatusDTO;
  quantity: number;
  weightGrams?: number;
  quantityPicked?: number;
  weightGramsPicked?: number;
  refusalReason?: string;
  substitution?: SubstitutionDTO;
}

export interface PickTaskDTO {
  id: string;
  orderGroupId: string;
  storeId: string;
  pickerId?: string;
  status: PickTaskStatusDTO;
  /** Modalidade do grupo: entrega própria ou retirada na loja. */
  fulfillment: 'delivery' | 'pickup';
  /** Código de coleta (gerado ao ficar pronto) — entregue ao entregador. */
  pickupCode?: string;
  assignedAt?: string;
  startedAt?: string;
  packedAt?: string;
  readyAt?: string;
  createdAt: string;
  items: PickItemDTO[];
}
