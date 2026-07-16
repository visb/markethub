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
  /** GTIN/EAN snapshot do produto (quando houver) — usado no scanner de bipagem. */
  gtin?: string;
  saleType: 'unit' | 'weight';
  status: PickItemStatusDTO;
  quantity: number;
  weightGrams?: number;
  quantityPicked?: number;
  weightGramsPicked?: number;
  refusalReason?: string;
  substitution?: SubstitutionDTO;
}

// ── Métricas do separador (story 65) ──

/** Janelas fixas das métricas do separador — mesma convenção da story 60 (ganhos do driver). */
export type PickerMetricsPeriodDTO = 'today' | '7d' | '30d';

/**
 * Métricas próprias do separador no período (tarefas com `readyAt` na janela).
 * Taxas em fração 0..1 (substituted/refused ÷ total de itens das tasks
 * concluídas); `null` quando não há dado para calcular (zero itens / nenhuma
 * task com startedAt+packedAt) — nunca NaN.
 */
export interface PickerMetricsDTO {
  period: PickerMetricsPeriodDTO;
  /** Tarefas concluídas (readyAt no período). */
  tasksCompleted: number;
  /** Itens efetivamente separados (status picked) nas tasks concluídas. */
  itemsPicked: number;
  /** Itens separados ÷ horas ativas (soma de packedAt − startedAt); null sem tempo ativo. */
  itemsPerHour: number | null;
  /** Fração de itens substituídos (0..1); null com zero itens. */
  substitutionRate: number | null;
  /** Fração de itens recusados (0..1); null com zero itens. */
  refusalRate: number | null;
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
