import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  GEOCODING_PROVIDER,
  type GeocodingProvider,
} from "../geocoding/geocoding-provider.interface";
import { PrismaService } from "../prisma/prisma.service";
import { isCityCovered } from "./coverage";

export interface AddressInput {
  label: string;
  street: string;
  number: string;
  district?: string | null;
  city: string;
  state: string;
  zipCode: string;
  complement?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isDefault?: boolean;
}

@Injectable()
export class AddressesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GEOCODING_PROVIDER) private readonly geocoding: GeocodingProvider,
  ) {}

  list(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async create(userId: string, input: AddressInput) {
    this.assertCovered(input.city, input.state);
    const count = await this.prisma.address.count({ where: { userId } });
    const isDefault = input.isDefault || count === 0;
    if (isDefault) await this.clearDefault(userId);
    const coords = await this.resolveCoords(input);
    return this.prisma.address.create({
      data: { ...input, ...coords, userId, isDefault },
    });
  }

  async update(userId: string, id: string, input: Partial<AddressInput>) {
    const current = await this.assertOwned(userId, id);
    if (input.city !== undefined || input.state !== undefined) {
      this.assertCovered(input.city ?? current.city, input.state ?? current.state);
    }
    if (input.isDefault) await this.clearDefault(userId);
    // endereço mudou sem coordenadas novas → re-geocodifica
    const addressChanged =
      input.street !== undefined || input.number !== undefined || input.city !== undefined;
    const coords =
      input.latitude == null && addressChanged
        ? await this.resolveCoords({ ...current, ...input })
        : {};
    return this.prisma.address.update({ where: { id }, data: { ...input, ...coords } });
  }

  async remove(userId: string, id: string) {
    await this.assertOwned(userId, id);
    await this.prisma.address.delete({ where: { id } });
    return { id, deleted: true };
  }

  async setDefault(userId: string, id: string) {
    await this.assertOwned(userId, id);
    await this.clearDefault(userId);
    return this.prisma.address.update({ where: { id }, data: { isDefault: true } });
  }

  /** Cobertura do lançamento (S6.3): só Curitiba e limítrofes. */
  private assertCovered(city: string, state: string) {
    if (!isCityCovered(city, state)) {
      throw new BadRequestException({
        code: "CITY_NOT_COVERED",
        message: `Ainda não atendemos ${city}. Por enquanto estamos em Curitiba e região metropolitana.`,
      });
    }
  }

  /** Lat/lng do cliente quando informadas; senão geocodifica (best-effort). */
  private async resolveCoords(
    input: Pick<AddressInput, "street" | "number" | "city" | "state" | "zipCode" | "latitude" | "longitude">,
  ): Promise<{ latitude: number | null; longitude: number | null }> {
    if (input.latitude != null && input.longitude != null) {
      return { latitude: input.latitude, longitude: input.longitude };
    }
    const hit = await this.geocoding.geocode({
      street: input.street,
      number: input.number,
      city: input.city,
      state: input.state,
      zipCode: input.zipCode,
    });
    return { latitude: hit?.latitude ?? null, longitude: hit?.longitude ?? null };
  }

  private clearDefault(userId: string) {
    return this.prisma.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  private async assertOwned(userId: string, id: string) {
    const addr = await this.prisma.address.findUnique({ where: { id } });
    if (!addr || addr.userId !== userId) {
      throw new NotFoundException({ code: "ADDRESS_NOT_FOUND", message: "Endereço não encontrado" });
    }
    return addr;
  }
}
