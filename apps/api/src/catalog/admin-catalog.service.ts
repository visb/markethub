import { Injectable, NotFoundException } from "@nestjs/common";
import type { EnrichmentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { Paginated } from "./catalog.service";

export interface AdminProductUpdate {
  name?: string;
  brand?: string | null;
  unit?: string | null;
  imageUrl?: string | null;
  categoryId?: string | null;
}

const LOCKABLE = ["name", "brand", "unit", "imageUrl", "category"] as const;

@Injectable()
export class AdminCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista produtos com filtros de busca/status/completude. */
  async listProducts(opts: {
    search?: string;
    status?: EnrichmentStatus;
    page?: number;
    pageSize?: number;
  }): Promise<Paginated<unknown>> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
    const search = opts.search?.trim();

    const where: Prisma.ProductWhereInput = {
      ...(opts.status ? { enrichmentStatus: opts.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { brand: { contains: search, mode: "insensitive" } },
              { gtin: { contains: search } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ completenessScore: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          brand: true,
          gtin: true,
          imageUrl: true,
          unit: true,
          enrichmentStatus: true,
          completenessScore: true,
          lockedFields: true,
          category: { select: { id: true, name: true, slug: true } },
          _count: { select: { offers: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, page, pageSize, total };
  }

  async productDetail(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        enrichment: true,
        offers: {
          select: {
            id: true,
            priceCents: true,
            promoPriceCents: true,
            available: true,
            externalId: true,
            store: { select: { id: true, name: true, merchant: { select: { name: true } } } },
          },
        },
      },
    });
    if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Not found" });
    return product;
  }

  /**
   * Override manual. Campos enviados são gravados e TRAVADOS (lockedFields) — o pipeline
   * de enriquecimento não os sobrescreve depois.
   */
  async updateProduct(productId: string, update: AdminProductUpdate) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Not found" });

    const locked = new Set(product.lockedFields);
    const data: Prisma.ProductUpdateInput = {};

    if (update.name !== undefined) {
      data.name = update.name;
      locked.add("name");
    }
    if (update.brand !== undefined) {
      data.brand = update.brand;
      locked.add("brand");
    }
    if (update.unit !== undefined) {
      data.unit = update.unit;
      locked.add("unit");
    }
    if (update.imageUrl !== undefined) {
      data.imageUrl = update.imageUrl;
      locked.add("imageUrl");
    }
    if (update.categoryId !== undefined) {
      data.category = update.categoryId
        ? { connect: { id: update.categoryId } }
        : { disconnect: true };
      locked.add("category");
    }

    data.lockedFields = [...locked].filter((f) => (LOCKABLE as readonly string[]).includes(f));

    return this.prisma.product.update({ where: { id: productId }, data });
  }

  /** Remove travas de campos (volta a aceitar enriquecimento automático). */
  async unlockFields(productId: string, fields: string[]) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Not found" });
    const remove = new Set(fields);
    return this.prisma.product.update({
      where: { id: productId },
      data: { lockedFields: product.lockedFields.filter((f) => !remove.has(f)) },
    });
  }
}
