import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DeliveryGateway } from "./delivery.gateway";

/** Corpo de um ping de posição enviado pelo app do entregador. */
export interface LocationPing {
  lat: number;
  lng: number;
  heading?: number | null;
  recordedAt: string;
}

// Rate-limit de ingest: no máximo 1 posição a cada 3s por entrega. Pings em
// excesso são descartados silenciosamente (o app publica em intervalo mais curto
// quando o device se move rápido). Estado em memória por deployment — aceitável
// para posição efêmera (sem persistência).
const MIN_INTERVAL_MS = 3_000;

/**
 * Ingest da posição do entregador (story 51). Valida que a entrega é do próprio
 * entregador e está em trânsito (coletada e ainda não entregue), aplica o
 * rate-limit e faz o fan-out via DeliveryGateway na sala do pedido. A posição
 * NÃO é persistida — só retransmitida em tempo real.
 */
@Injectable()
export class DriverLocationService {
  private readonly lastIngestAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: DeliveryGateway,
  ) {}

  async ingest(userId: string, deliveryId: string, ping: LocationPing): Promise<{ accepted: boolean }> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { id: true, driverId: true, status: true, orderGroupId: true },
    });
    if (!delivery) {
      throw new NotFoundException({ code: "DELIVERY_NOT_FOUND", message: "Entrega não encontrada" });
    }
    if (delivery.driverId !== userId) {
      throw new ForbiddenException({ code: "NOT_DELIVERY_DRIVER", message: "Entrega não é sua" });
    }
    // "Em trânsito" = entre confirmar coleta (picked_up) e confirmar entrega.
    if (delivery.status !== "picked_up") {
      throw new BadRequestException({
        code: "DELIVERY_NOT_IN_TRANSIT",
        message: "Só é possível publicar posição de uma entrega coletada e em trânsito",
      });
    }

    const now = Date.now();
    const last = this.lastIngestAt.get(deliveryId);
    if (last != null && now - last < MIN_INTERVAL_MS) {
      return { accepted: false }; // rate-limit: descartado silenciosamente
    }
    this.lastIngestAt.set(deliveryId, now);

    const group = await this.prisma.orderGroup.findUnique({
      where: { id: delivery.orderGroupId },
      select: { orderId: true },
    });
    if (!group) {
      throw new NotFoundException({ code: "ORDER_GROUP_NOT_FOUND", message: "Pedido não encontrado" });
    }

    this.gateway.publishLocation(group.orderId, {
      deliveryId: delivery.id,
      orderId: group.orderId,
      lat: ping.lat,
      lng: ping.lng,
      heading: ping.heading ?? null,
      recordedAt: ping.recordedAt,
    });
    return { accepted: true };
  }
}
