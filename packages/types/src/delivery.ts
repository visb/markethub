// Delivery / Entrega própria pela loja (MVP)

/** Modalidade de cumprimento por loja (OrderGroup). */
export type FulfillmentTypeDTO = "delivery" | "pickup";

export type DeliveryStatusDTO =
  | "unassigned"
  | "assigned"
  | "picked_up"
  | "delivered"
  | "canceled";

/** Entrega de uma OrderGroup feita por um entregador da própria loja. */
export interface DeliveryDTO {
  id: string;
  orderGroupId: string;
  orderId: string;
  status: DeliveryStatusDTO;
  storeId: string;
  storeName: string;
  customerName: string;
  /** Endereço formatado do cliente (snapshot do pedido). */
  address?: string;
  itemCount: number;
  driverId?: string;
  driverName?: string;
  /** Código de coleta a apresentar/validar na loja (visível ao entregador). */
  pickupCode?: string;
  /** Código que o cliente informa na entrega (visível ao entregador). */
  deliveryCode?: string;
  assignedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  createdAt?: string;
}

/** Entregador vinculado a uma loja (StoreStaff role driver), p/ atribuição. */
export interface StoreDriverDTO {
  /** userId do entregador. */
  id: string;
  name: string;
  /** Entregas em aberto atribuídas a ele (carga atual). */
  activeDeliveries: number;
}
