import { Injectable, Logger } from "@nestjs/common";

/**
 * Eventos de entrega. Stub de tempo real (a integração Socket.IO/push entra na
 * Fase 5 — rastreio ao cliente). Por ora apenas registra.
 */
@Injectable()
export class DeliveryEvents {
  private readonly logger = new Logger(DeliveryEvents.name);

  routeAccepted(payload: { routeId: string; driverId: string }): void {
    this.logger.log(`route.accepted ${payload.routeId} por ${payload.driverId}`);
  }

  routeOffered(payload: { routeId: string; driverId: string }): void {
    this.logger.log(`route.offered ${payload.routeId} → ${payload.driverId}`);
  }
}
