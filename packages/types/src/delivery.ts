// Delivery / Entrega — Fase 4 (S4.1)

export type DriverStatusDTO = 'offline' | 'available' | 'on_route';

export type DeliveryRouteStatusDTO =
  | 'offered'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'canceled'
  | 'expired';

export type RouteStopTypeDTO = 'pickup' | 'dropoff';

export type RouteStopStatusDTO = 'pending' | 'arrived' | 'done';

export interface DriverProfileDTO {
  id: string;
  vehicleType: string;
  status: DriverStatusDTO;
  currentLat?: number;
  currentLng?: number;
  lastSeenAt?: string;
}

export interface RouteStopGroupDTO {
  orderGroupId: string;
  orderId: string;
  /** Código de coleta a apresentar na loja (visível ao entregador). */
  pickupCode?: string;
  itemCount: number;
}

export interface RouteStopDTO {
  id: string;
  sequence: number;
  type: RouteStopTypeDTO;
  status: RouteStopStatusDTO;
  // pickup
  storeId?: string;
  storeName?: string;
  lat?: number;
  lng?: number;
  address?: string;
  groups?: RouteStopGroupDTO[];
  // dropoff
  orderId?: string;
  customerName?: string;
  arrivedAt?: string;
  doneAt?: string;
}

export interface DeliveryRouteDTO {
  id: string;
  status: DeliveryRouteStatusDTO;
  estimatedEarningsCents: number;
  distanceMeters: number;
  offerExpiresAt?: string;
  offeredAt?: string;
  acceptedAt?: string;
  completedAt?: string;
  stops: RouteStopDTO[];
}

export interface DriverEarningsDTO {
  /** Janela do dia (ISO local). */
  date: string;
  totalCents: number;
  routesCompleted: number;
  routesAccepted: number;
}
