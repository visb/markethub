import type {
  ConnectorContext,
  PushOrderInput,
  RawPrice,
  RawProduct,
  RawStock,
} from "./erp.types";

/**
 * Contrato único de integração com ERPs. Cada ERP real implementa esta interface;
 * o orquestrador (ErpService) só fala com ela — não conhece detalhes de cada ERP.
 */
export interface ErpConnector {
  /** Identificador do tipo (ex.: "csv", "bling", "tiny"). Casado com Merchant.connectorType. */
  readonly type: string;

  fetchProducts(ctx: ConnectorContext): Promise<RawProduct[]>;
  fetchPrices(ctx: ConnectorContext): Promise<RawPrice[]>;
  fetchStock(ctx: ConnectorContext): Promise<RawStock[]>;

  /** Empurra pedido ao ERP. Stub até Fase 2/3. */
  pushOrder(ctx: ConnectorContext, order: PushOrderInput): Promise<{ externalOrderId: string }>;
  /** Confirma processamento de um pedido junto ao ERP. */
  acknowledge(ctx: ConnectorContext, externalOrderId: string): Promise<void>;
}

/** Token DI para a lista de conectores registrados. */
export const ERP_CONNECTORS = Symbol("ERP_CONNECTORS");
