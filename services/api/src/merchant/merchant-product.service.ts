import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, SaleType } from "@prisma/client";
import { cleanGtin } from "../shared/catalog-normalize";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage";
import { MerchantService } from "./merchant.service";

export interface CreateProductInput {
  storeId: string;
  name: string;
  brand?: string;
  saleType?: SaleType;
  packageSize?: string;
  imageUrl?: string;
  categoryId?: string;
  gtin?: string;
  // oferta na loja
  priceCents: number;
  promoPriceCents?: number | null;
  available?: boolean;
  quantity?: number | null;
}

export interface UpdateProductInput {
  name?: string;
  brand?: string | null;
  saleType?: SaleType;
  packageSize?: string | null;
  imageUrl?: string | null;
  categoryId?: string | null;
}

const PRODUCT_LOCKABLE = ["name", "brand", "saleType", "packageSize", "imageUrl", "category"];

/**
 * Cadastro de produto canônico pelo manager (S3.10). Cria Product local +
 * Offer/Stock na sua loja. Reusa canônico por GTIN (dedup) e respeita
 * lockedFields para que o enriquecimento (S1.5) não sobrescreva edições.
 */
@Injectable()
export class MerchantProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchant: MerchantService,
    private readonly storage: StorageService,
  ) {}

  /** URL pré-assinada para upload de imagem direto ao storage (S3/MinIO). */
  async uploadUrl(userId: string, filename: string, contentType: string) {
    await this.assertManages(userId); // só managers
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    return this.storage.presignUpload(key, contentType);
  }

  async create(userId: string, input: CreateProductInput) {
    await this.assertStore(userId, input.storeId);
    if (!input.name?.trim()) {
      throw new BadRequestException({ code: "NAME_REQUIRED", message: "Nome é obrigatório" });
    }
    if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
      throw new BadRequestException({ code: "INVALID_PRICE", message: "priceCents inválido" });
    }

    const gtin = cleanGtin(input.gtin);

    // Dedup por GTIN: se o canônico já existe, reusa (cria só a Offer).
    if (gtin) {
      const existing = await this.prisma.product.findUnique({ where: { gtin } });
      if (existing) {
        const offer = await this.attachOffer(userId, existing.id, input);
        return { product: existing, offer, reused: true, warnings: [] as ProductWarning[] };
      }
    }

    // Sem GTIN: alerta possíveis duplicatas por nome/marca (não bloqueia).
    const warnings = gtin ? [] : await this.findSimilar(input.name, input.brand);

    const product = await this.prisma.product.create({
      data: {
        gtin,
        name: input.name.trim(),
        brand: input.brand,
        saleType: input.saleType ?? "unit",
        packageSize: input.packageSize,
        imageUrl: input.imageUrl,
        categoryId: input.categoryId,
        source: "merchant",
        createdById: userId,
        // tudo informado manualmente entra no lock (enrichment não sobrescreve)
        lockedFields: this.lockedFromCreate(input),
      },
    });

    const offer = await this.attachOffer(userId, product.id, input);
    return { product, offer, reused: false, warnings };
  }

  async update(userId: string, productId: string, input: UpdateProductInput) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Produto não encontrado" });
    await this.assertCanEdit(userId, productId);

    const data: Prisma.ProductUpdateInput = {};
    const locked = new Set(product.lockedFields);
    if (input.name !== undefined) {
      if (!input.name?.trim()) throw new BadRequestException({ code: "NAME_REQUIRED", message: "Nome é obrigatório" });
      data.name = input.name.trim();
      locked.add("name");
    }
    if (input.brand !== undefined) {
      data.brand = input.brand;
      locked.add("brand");
    }
    if (input.saleType !== undefined) {
      data.saleType = input.saleType;
      locked.add("saleType");
    }
    if (input.packageSize !== undefined) {
      data.packageSize = input.packageSize;
      locked.add("packageSize");
    }
    if (input.imageUrl !== undefined) {
      data.imageUrl = input.imageUrl;
      locked.add("imageUrl");
    }
    if (input.categoryId !== undefined) {
      data.category = input.categoryId ? { connect: { id: input.categoryId } } : { disconnect: true };
      locked.add("category");
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({ code: "NO_FIELDS", message: "Nenhum campo para atualizar" });
    }
    data.lockedFields = [...locked].filter((f) => PRODUCT_LOCKABLE.includes(f));

    return this.prisma.product.update({ where: { id: productId }, data });
  }

  // ── helpers ──

  private async attachOffer(userId: string, productId: string, input: CreateProductInput) {
    const existing = await this.prisma.offer.findUnique({
      where: { storeId_productId: { storeId: input.storeId, productId } },
    });
    if (existing) {
      throw new BadRequestException({
        code: "OFFER_EXISTS",
        message: "Já existe oferta deste produto na loja",
      });
    }

    const offer = await this.prisma.offer.create({
      data: {
        storeId: input.storeId,
        productId,
        priceCents: input.priceCents,
        promoPriceCents: input.promoPriceCents ?? null,
        available: input.available ?? true,
        // criada manualmente: trava preço/disponibilidade contra o sync ERP
        lockedFields: ["priceCents", "promoPriceCents", "available"],
        updatedById: userId,
      },
    });

    await this.prisma.stock.upsert({
      where: { storeId_productId: { storeId: input.storeId, productId } },
      update: {
        quantity: input.quantity ?? null,
        available: input.available ?? true,
        lockedFields: ["quantity", "available"],
        updatedById: userId,
      },
      create: {
        storeId: input.storeId,
        productId,
        quantity: input.quantity ?? null,
        available: input.available ?? true,
        lockedFields: ["quantity", "available"],
        updatedById: userId,
      },
    });

    return offer;
  }

  private lockedFromCreate(input: CreateProductInput): string[] {
    const locked: string[] = ["name", "saleType"];
    if (input.brand !== undefined) locked.push("brand");
    if (input.packageSize !== undefined) locked.push("packageSize");
    if (input.imageUrl !== undefined) locked.push("imageUrl");
    if (input.categoryId !== undefined) locked.push("category");
    return locked;
  }

  private async findSimilar(name: string, brand?: string): Promise<ProductWarning[]> {
    const similar = await this.prisma.product.findMany({
      where: {
        name: { contains: name.trim().split(/\s+/)[0] ?? name, mode: "insensitive" },
        ...(brand ? { brand: { equals: brand, mode: "insensitive" } } : {}),
      },
      select: { id: true, name: true, brand: true },
      take: 5,
    });
    return similar.map((p) => ({ productId: p.id, name: p.name, brand: p.brand }));
  }

  /**
   * Manager só edita Product que ele criou OU cujo conjunto de Offers está todo
   * nas lojas dele (produto não compartilhado entre merchants).
   */
  private async assertCanEdit(userId: string, productId: string) {
    const product = await this.prisma.product.findUniqueOrThrow({ where: { id: productId } });
    if (product.createdById === userId) return;

    const storeIds = await this.merchant.managerStoreIds(userId);
    const offers = await this.prisma.offer.findMany({
      where: { productId },
      select: { storeId: true },
    });
    if (offers.length === 0 || !offers.every((o) => storeIds.includes(o.storeId))) {
      throw new ForbiddenException({
        code: "PRODUCT_NOT_EDITABLE",
        message: "Produto canônico compartilhado — edição reservada ao admin",
      });
    }
  }

  private async assertStore(userId: string, storeId: string) {
    const storeIds = await this.merchant.managerStoreIds(userId);
    if (!storeIds.includes(storeId)) {
      throw new ForbiddenException({ code: "STORE_NOT_MANAGED", message: "Loja não gerida por você" });
    }
  }

  private async assertManages(userId: string) {
    const storeIds = await this.merchant.managerStoreIds(userId);
    if (storeIds.length === 0) {
      throw new ForbiddenException({ code: "NOT_A_MANAGER", message: "Usuário não gerencia nenhuma loja" });
    }
  }
}

interface ProductWarning {
  productId: string;
  name: string;
  brand: string | null;
}
