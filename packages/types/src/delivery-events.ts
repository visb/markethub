// Contrato de eventos de tempo real da entrega ao vivo (story 51). O entregador
// publica a posição via REST (POST throttled); o backend faz fan-out no canal
// Socket.IO `/delivery`, sala `order:<orderId>`. Versionado p/ evoluir sem
// quebrar clientes. O api NÃO depende deste pacote — mantenha em sincronia com
// `services/api/src/driver/delivery.gateway.ts`.

export const DELIVERY_EVENTS_VERSION = 1;
export const DELIVERY_NAMESPACE = "/delivery";

/** Nome do evento de posição do entregador emitido na sala `order:<orderId>`. */
export const DRIVER_LOCATION_EVENT = "driver:location" as const;
export type DriverLocationEvent = typeof DRIVER_LOCATION_EVENT;

/** Mensagens que o cliente envia para entrar no canal (autorização no servidor). */
export interface DeliverySubscribeMessages {
  /** Cliente (dono) ou admin: rastreio ao vivo de um pedido. */
  "subscribe:order": { orderId: string };
}

/** Payload do evento `driver:location` (posição efêmera do entregador). */
export interface DriverLocationPayload {
  v: number;
  deliveryId: string;
  orderId: string;
  lat: number;
  lng: number;
  /** Rumo em graus (0–360) quando disponível; null caso o device não reporte. */
  heading: number | null;
  /** Instante da leitura no device (ISO 8601). */
  recordedAt: string;
}

/** Corpo do POST de ingest de posição (`POST /driver/deliveries/:id/location`). */
export interface DriverLocationInput {
  lat: number;
  lng: number;
  heading?: number | null;
  recordedAt: string;
}
