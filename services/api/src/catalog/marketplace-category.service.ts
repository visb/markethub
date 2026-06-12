import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { slugify } from "../erp/catalog-normalize";
import { PrismaService } from "../prisma/prisma.service";

export interface MktCategoryInput {
  name?: string;
  displayOrder?: number;
  visible?: boolean;
  parentId?: string | null;
  /** Pergunta de preparo do departamento (S6.6); null remove. */
  prepOptions?: { label: string; options: string[] } | null;
}

@Injectable()
export class MarketplaceCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Curadas (admin) — todas, com contagem de categorias cruas vinculadas. */
  listAdmin() {
    return this.prisma.marketplaceCategory.findMany({
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { rawCategories: true } } },
    });
  }

  /** Curadas visíveis (marketplace/app cliente), ordenadas. */
  listPublic() {
    return this.prisma.marketplaceCategory.findMany({
      where: { visible: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, parentId: true },
    });
  }

  async create(input: MktCategoryInput) {
    const name = input.name?.trim();
    if (!name) throw new NotFoundException({ code: "NAME_REQUIRED", message: "Nome obrigatório" });
    return this.prisma.marketplaceCategory.create({
      data: {
        name,
        slug: slugify(name),
        displayOrder: input.displayOrder ?? 0,
        visible: input.visible ?? true,
        parentId: input.parentId ?? null,
      },
    });
  }

  async update(id: string, input: MktCategoryInput) {
    await this.assertExists(id);
    return this.prisma.marketplaceCategory.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name.trim(), slug: slugify(input.name) } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
        ...(input.visible !== undefined ? { visible: input.visible } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.prepOptions !== undefined
          ? { prepOptions: input.prepOptions ?? Prisma.JsonNull }
          : {}),
      },
    });
  }

  async remove(id: string) {
    await this.assertExists(id);
    // Desvincula categorias cruas antes de remover.
    await this.prisma.category.updateMany({
      where: { marketplaceCategoryId: id },
      data: { marketplaceCategoryId: null },
    });
    await this.prisma.marketplaceCategory.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** Categorias cruas (origem ERP/Cosmos) com seu mapeamento atual — para curadoria. */
  listRawCategories() {
    return this.prisma.category.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        marketplaceCategoryId: true,
        _count: { select: { products: true } },
      },
    });
  }

  /** Vincula/desvincula uma categoria crua a uma curada. */
  async assignRaw(categoryId: string, marketplaceCategoryId: string | null) {
    const cat = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!cat) throw new NotFoundException({ code: "CATEGORY_NOT_FOUND", message: "Not found" });
    if (marketplaceCategoryId) await this.assertExists(marketplaceCategoryId);
    return this.prisma.category.update({
      where: { id: categoryId },
      data: { marketplaceCategoryId },
      select: { id: true, marketplaceCategoryId: true },
    });
  }

  private async assertExists(id: string) {
    const c = await this.prisma.marketplaceCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!c) throw new NotFoundException({ code: "MKT_CATEGORY_NOT_FOUND", message: "Not found" });
  }
}
