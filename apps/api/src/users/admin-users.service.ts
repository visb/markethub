import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { type Prisma, type RoleName, type StaffRole } from "@prisma/client";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";

export interface CreateStaffInput {
  email: string;
  name: string;
  password: string;
  staffRole: StaffRole; // manager | picker | driver
  storeId: string;
}

// Papel operacional na loja → papel de acesso (RoleName).
const STAFF_TO_ROLE: Record<StaffRole, RoleName> = {
  manager: "merchant",
  picker: "picker",
  driver: "driver",
};

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: { role?: RoleName; search?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
    const search = opts.search?.trim();

    const where: Prisma.UserWhereInput = {
      ...(opts.role ? { roles: { some: { role: { name: opts.role } } } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          createdAt: true,
          roles: { select: { role: { select: { name: true } } } },
          staffOf: {
            select: {
              staffRole: true,
              store: { select: { name: true, merchant: { select: { name: true } } } },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      active: u.active,
      createdAt: u.createdAt,
      roles: u.roles.map((r) => r.role.name),
      staff: u.staffOf.map((s) => ({
        staffRole: s.staffRole,
        store: s.store.name,
        merchant: s.store.merchant.name,
      })),
    }));
    return { items, page, pageSize, total };
  }

  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
        staffOf: {
          select: {
            id: true,
            staffRole: true,
            active: true,
            store: {
              select: { id: true, name: true, merchant: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "User not found" });
    return { ...user, roles: user.roles.map((r) => r.role.name) };
  }

  async setActive(id: string, active: boolean) {
    await this.assertExists(id);
    return this.prisma.user.update({
      where: { id },
      data: { active },
      select: { id: true, active: true },
    });
  }

  /** Cria funcionário (merchant-manager ou separador) vinculado a uma loja. */
  async createStaff(input: CreateStaffInput) {
    const store = await this.prisma.store.findUnique({ where: { id: input.storeId } });
    if (!store) throw new BadRequestException({ code: "STORE_NOT_FOUND", message: "Store not found" });

    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException({ code: "EMAIL_TAKEN", message: "Email já cadastrado" });

    const roleName = STAFF_TO_ROLE[input.staffRole];
    const passwordHash = await argon2.hash(input.password);

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        roles: { create: [{ role: { connectOrCreate: { where: { name: roleName }, create: { name: roleName } } } }] },
        staffOf: { create: [{ storeId: input.storeId, staffRole: input.staffRole }] },
      },
      select: { id: true, email: true, name: true },
    });
    return user;
  }

  /** Lojas (com merchant) para o formulário de criação de staff. */
  async listStores() {
    const stores = await this.prisma.store.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, merchant: { select: { name: true } } },
    });
    return stores.map((s) => ({ id: s.id, name: s.name, merchant: s.merchant.name }));
  }

  private async assertExists(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!u) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "User not found" });
  }
}
