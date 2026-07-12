// Delivery / Entrega própria pela loja (MVP)

/** Modalidade de cumprimento por loja (OrderGroup). */
export type FulfillmentTypeDTO = "delivery" | "pickup";

export type DeliveryStatusDTO =
  | "unassigned"
  | "assigned"
  | "picked_up"
  | "delivered"
  | "failed"
  | "canceled";

/** Motivo da falha de entrega reportada pelo entregador (story 61). */
export type DeliveryFailReasonDTO = "customer_absent" | "wrong_address" | "refused" | "other";

/** Entrega de uma OrderGroup feita por um entregador da própria loja. */
export interface DeliveryDTO {
  id: string;
  orderGroupId: string;
  orderId: string;
  status: DeliveryStatusDTO;
  storeId: string;
  storeName: string;
  /** Coordenadas da loja (origem da entrega). null quando a loja não tem geo. */
  storeLat?: number | null;
  storeLng?: number | null;
  customerName: string;
  /** Endereço formatado do cliente (snapshot do pedido). */
  address?: string;
  /** Coordenadas do endereço de entrega (snapshot). null quando o endereço não tem geo. */
  destLat?: number | null;
  destLng?: number | null;
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
  /** Motivo da falha (story 61) — presente quando status = `failed`. */
  failReason?: DeliveryFailReasonDTO | null;
  /** Observação livre do entregador na falha (story 61). */
  failNote?: string | null;
  /** Momento da falha (story 61). */
  failedAt?: string;
  createdAt?: string;
}

/** Corpo de `POST /driver/deliveries/:id/fail` (story 61): motivo + observação. */
export interface FailDeliveryInput {
  reason: DeliveryFailReasonDTO;
  note?: string;
}

/** Entregador vinculado a uma loja (StoreStaff role driver), p/ atribuição. */
export interface StoreDriverDTO {
  /** userId do entregador. */
  id: string;
  name: string;
  /** Entregas em aberto atribuídas a ele (carga atual). */
  activeDeliveries: number;
  /** Está de turno agora (story 62). Indisponível não pode ser atribuído. */
  available: boolean;
  /** Momento em que ligou o turno (ISO); null quando indisponível. */
  availableSince: string | null;
}

/** Estado de turno on/off do entregador (story 62) — app driver. */
export interface DriverAvailabilityDTO {
  /** O entregador está de turno (disponível para receber/aceitar entregas). */
  available: boolean;
  /** Momento em que ligou o turno (ISO); null quando indisponível. */
  availableSince: string | null;
}

/** Corpo de `POST /driver/availability` (story 62): liga/desliga o turno. */
export interface SetAvailabilityInput {
  available: boolean;
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
