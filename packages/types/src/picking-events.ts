// Contrato de eventos de tempo real da separação (S3.8). Versionado p/ permitir
// evolução sem quebrar clientes. Namespace Socket.IO: "/picking".

export const PICKING_EVENTS_VERSION = 1;
export const PICKING_NAMESPACE = "/picking";

/** Mensagens que o cliente envia para entrar em canais (com autorização no servidor). */
export interface PickingSubscribeMessages {
  /** Separador/manager/admin: stream de tarefas de uma loja. */
  "subscribe:store": { storeId: string };
  /** Cliente (dono) ou staff da loja: eventos de um sub-pedido. */
  "subscribe:group": { orderGroupId: string };
  /** Cliente (dono) ou admin: rastreio de um pedido (canal `order:<orderId>`). */
  "subscribe:order": { orderId: string };
}

/** Nome do evento de rastreio do pedido emitido no canal `order:<orderId>` (S5.1). */
export const ORDER_UPDATED_EVENT = "order.updated" as const;
export type OrderUpdatedEvent = typeof ORDER_UPDATED_EVENT;

/** Nome do evento de tarefa de separação emitido na `store room` (S3.8 / story 02). */
export const PICK_TASK_UPDATED_EVENT = "pick_task.updated" as const;
export type PickTaskUpdatedEvent = typeof PICK_TASK_UPDATED_EVENT;

/**
 * Nome do evento de resolução de substituição (story 64). Emitido na `group room`
 * (cliente dono) e na `store room` (separador que propôs) quando o cliente
 * aprova/recusa ou a política de timeout resolve — o picker sai do "às cegas".
 */
export const SUBSTITUTION_RESOLVED_EVENT = "substitution.resolved" as const;
export type SubstitutionResolvedEvent = typeof SUBSTITUTION_RESOLVED_EVENT;

/**
 * Eventos de pedido (OrderGroup) emitidos na `store room` para o app merchant
 * acompanhar pedidos em tempo real (story 12). `order.created` ao surgir o grupo
 * na loja; `order.status_changed` a cada transição de status do OrderGroup. São
 * os MESMOS pontos de emissão que a story 09 usa p/ webhooks (mesmo nome de
 * evento) — aqui o transporte é socket à store room.
 */
export const ORDER_CREATED_EVENT = "order.created" as const;
export type OrderCreatedEvent = typeof ORDER_CREATED_EVENT;

export const ORDER_STATUS_CHANGED_EVENT = "order.status_changed" as const;
export type OrderStatusChangedEvent = typeof ORDER_STATUS_CHANGED_EVENT;

/** Payload dos eventos de pedido na store room. */
export interface OrderStoreEventPayload {
  v: number;
  orderId: string;
  merchantId: string;
  storeId: string;
  status: string;
}

export type PickingServerEvent =
  | "pick_task.assigned"
  | "pick_task.updated"
  | "pick_task.ready_for_pickup"
  | "item.updated"
  | "substitution.proposed"
  | "substitution.resolved";

export interface PickTaskEventPayload {
  v: number;
  pickTaskId: string;
  orderGroupId: string;
  storeId: string;
  status: string;
  pickerId?: string | null;
}

export interface ItemUpdatedPayload {
  v: number;
  orderGroupId: string;
  pickItemId: string;
  status: string;
}

export interface SubstitutionEventPayload {
  v: number;
  substitutionId: string;
  orderGroupId: string;
  pickItemId: string;
  approvalStatus: "pending" | "approved" | "rejected";
}

/** Mapa evento → payload, para tipar o cliente. */
export interface PickingServerEventPayloads {
  "pick_task.assigned": PickTaskEventPayload;
  "pick_task.updated": PickTaskEventPayload;
  "pick_task.ready_for_pickup": PickTaskEventPayload;
  "item.updated": ItemUpdatedPayload;
  "substitution.proposed": SubstitutionEventPayload;
  "substitution.resolved": SubstitutionEventPayload;
}
