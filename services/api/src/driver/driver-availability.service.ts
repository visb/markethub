import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Estado de turno do entregador exposto ao app (story 62). */
export interface DriverAvailabilityView {
  /** O entregador está de turno (disponível para receber/aceitar entregas). */
  available: boolean;
  /** Momento em que ligou o turno (ISO). null quando indisponível. */
  availableSince: string | null;
}

/** Deriva a view a partir do timestamp cru do banco. */
export function toAvailabilityView(driverAvailableAt: Date | null): DriverAvailabilityView {
  return {
    available: driverAvailableAt != null,
    availableSince: driverAvailableAt ? driverAvailableAt.toISOString() : null,
  };
}

/**
 * Guarda de atribuição/aceite (story 62): recusa quando o entregador está
 * indisponível (fora de turno). Função pura sobre o Prisma — reusada pela
 * atribuição manual da loja (`StoreDeliveryService.assign`) e pelo aceite
 * self-service (`DriverService.accept`), sem acoplar suas construções.
 */
export async function assertDriverAvailable(
  prisma: Pick<PrismaService, "user">,
  driverId: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: driverId },
    select: { driverAvailableAt: true },
  });
  if (!user?.driverAvailableAt) {
    throw new BadRequestException({
      code: "DRIVER_UNAVAILABLE",
      message: "Entregador está indisponível (fora de turno)",
    });
  }
}

/**
 * Turno on/off do entregador (story 62). A disponibilidade é global ao driver
 * (não por loja) e vive em `User.driverAvailableAt` — mesmo precedente do veículo
 * do turno (`activeVehicleId`, story 15): null = de folga; timestamp = "disponível
 * desde". Guarda as atribuições/aceite: só driver disponível recebe entrega
 * (`assertAvailable`). Logout desliga o turno (feito no AuthService).
 */
@Injectable()
export class DriverAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Estado corrente do turno do entregador (para a home do app driver). */
  async current(userId: string): Promise<DriverAvailabilityView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { driverAvailableAt: true },
    });
    return toAvailabilityView(user?.driverAvailableAt ?? null);
  }

  /**
   * Liga/desliga o turno. Idempotente: ligar quando já ligado PRESERVA o "desde"
   * original (não reinicia o cronômetro); desligar quando já desligado é no-op.
   */
  async set(userId: string, available: boolean): Promise<DriverAvailabilityView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { driverAvailableAt: true },
    });
    const current = user?.driverAvailableAt ?? null;
    if (available) {
      if (current) return toAvailabilityView(current); // já disponível — mantém o "desde"
      const now = new Date();
      await this.prisma.user.update({ where: { id: userId }, data: { driverAvailableAt: now } });
      return toAvailabilityView(now);
    }
    if (current) {
      await this.prisma.user.update({ where: { id: userId }, data: { driverAvailableAt: null } });
    }
    return toAvailabilityView(null);
  }

  /** Guarda de atribuição/aceite (delega à função pura). */
  assertAvailable(driverId: string): Promise<void> {
    return assertDriverAvailable(this.prisma, driverId);
  }
}
