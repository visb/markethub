import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async create(userId: string, input: AddressInput) {
    const count = await this.prisma.address.count({ where: { userId } });
    const isDefault = input.isDefault || count === 0;
    if (isDefault) await this.clearDefault(userId);
    return this.prisma.address.create({
      data: { ...input, userId, isDefault },
    });
  }

  async update(userId: string, id: string, input: Partial<AddressInput>) {
    await this.assertOwned(userId, id);
    if (input.isDefault) await this.clearDefault(userId);
    return this.prisma.address.update({ where: { id }, data: input });
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
  }
}
