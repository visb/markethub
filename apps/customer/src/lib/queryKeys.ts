/**
 * Chaves de query centralizadas (CLAUDE.md: NUNCA string literal como query key
 * fora deste arquivo). Estruturadas por recurso para invalidação granular.
 */
import type { ViewportBoundsDTO } from "@markethub/types";

export const queryKeys = {
  tracking: {
    /** Snapshot de rastreio (OrderTracking) de um pedido. */
    order: (orderId: string) => ["tracking", "order", orderId] as const,
    /** Substituições pendentes de um pedido. */
    substitutions: (orderId: string) => ["tracking", "substitutions", orderId] as const,
  },
  explore: {
    /** Mercados dentro do viewport do mapa (bounding box). */
    nearby: (bounds: ViewportBoundsDTO) =>
      ["explore", "nearby", bounds.north, bounds.south, bounds.east, bounds.west] as const,
    /** Posição atual do dispositivo (GPS) — centro inicial do mapa. */
    deviceLocation: ["explore", "device-location"] as const,
  },
  addresses: {
    /** Endereços do usuário autenticado. */
    all: ["addresses"] as const,
  },
} as const;
