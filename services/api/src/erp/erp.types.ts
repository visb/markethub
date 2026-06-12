/** Tipos crus vindos do ERP (antes de normalizar para o catálogo canônico). */

export interface RawProduct {
  /** Id do produto no ERP da loja. Chave de reconciliação. */
  externalId: string;
  gtin?: string | null;
  name: string;
  brand?: string | null;
  unit?: string | null;
  categoryName?: string | null;
  imageUrl?: string | null;
  priceCents: number;
  promoPriceCents?: number | null;
  available?: boolean;
  stockQuantity?: number | null;
}

export interface RawPrice {
  externalId: string;
  priceCents: number;
  promoPriceCents?: number | null;
  available?: boolean;
}

export interface RawStock {
  externalId: string;
  quantity?: number | null;
  available: boolean;
}

/** Contexto passado ao conector em cada operação. */
export interface ConnectorContext {
  merchantId: string;
  store: { id: string; externalId: string | null };
  config: unknown;
  /** Para sync incremental (delta). */
  since?: Date;
}

/** Pedido a ser empurrado ao ERP (stub até Fase 2/3). */
export interface PushOrderInput {
  orderId: string;
  items: Array<{ externalId: string; quantity: number }>;
}

export interface SyncCounters {
  processed: number;
  updated: number;
  failed: number;
}
