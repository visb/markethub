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
