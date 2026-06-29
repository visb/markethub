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

// ── Seleção de veículo pelo entregador (story 15) ──

/** Tipo do veículo da frota (mesma enum do merchant). */
export type DriverVehicleTypeDTO = "motorcycle" | "car" | "van";

/**
 * Veículo da frota da rede do entregador, exibido no app driver para seleção.
 * É o subconjunto do veículo relevante ao entregador (sem dados de rede/escopo).
 */
export interface DriverVehicleDTO {
  id: string;
  plate: string;
  type: DriverVehicleTypeDTO;
  description: string | null;
}

/** Corpo de `PUT /driver/vehicle`: o veículo escolhido para o turno. */
export interface SelectVehicleInput {
  vehicleId: string;
}
