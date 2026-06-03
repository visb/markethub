import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EnrichmentQueueService } from "./enrichment.queue";

/** Faixas de score p/ o histograma de qualidade. */
const BUCKETS: { label: string; gte: number; lt: number }[] = [
  { label: "0-24", gte: 0, lt: 25 },
  { label: "25-49", gte: 25, lt: 50 },
  { label: "50-74", gte: 50, lt: 75 },
  { label: "75-99", gte: 75, lt: 100 },
  { label: "100", gte: 100, lt: 101 },
];

/**
 * Qualidade de catálogo (S5.5): score de completude por produto, distribuição,
 * priorização de incompletos e reenriquecimento (BullMQ). Snapshots simples p/
 * acompanhar cobertura ao longo do tempo.
 */
@Injectable()
export class CatalogQualityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: EnrichmentQueueService,
  ) {}

  /** Resumo: total, média, distribuição por faixa e contagem por status. */
  async summary(filter: { storeId?: string; categoryId?: string } = {}) {
    const where = this.buildWhere(filter);
    const [total, agg, statusCounts, distribution] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.aggregate({ where, _avg: { completenessScore: true } }),
      this.prisma.product.groupBy({ by: ["enrichmentStatus"], where, _count: { _all: true } }),
      Promise.all(
        BUCKETS.map(async (b) => ({
          label: b.label,
          count: await this.prisma.product.count({
            where: { ...where, completenessScore: { gte: b.gte, lt: b.lt } },
          }),
        })),
      ),
    ]);

    return {
      total,
      avgScore: Math.round(agg._avg.completenessScore ?? 0),
      byStatus: Object.fromEntries(statusCounts.map((s) => [s.enrichmentStatus, s._count._all])),
      distribution,
    };
  }

  /** Lista de incompletos priorizada (menor score primeiro). */
  async incomplete(filter: { storeId?: string; categoryId?: string; limit?: number } = {}) {
    const limit = Math.min(200, Math.max(1, filter.limit ?? 50));
    const products = await this.prisma.product.findMany({
      where: { ...this.buildWhere(filter), completenessScore: { lt: 100 } },
      orderBy: [{ completenessScore: "asc" }, { updatedAt: "asc" }],
      take: limit,
      select: {
        id: true,
        name: true,
        brand: true,
        gtin: true,
        imageUrl: true,
        completenessScore: true,
        enrichmentStatus: true,
        category: { select: { name: true } },
      },
    });
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      gtin: p.gtin,
      hasImage: !!p.imageUrl,
      completenessScore: p.completenessScore,
      enrichmentStatus: p.enrichmentStatus,
      category: p.category?.name ?? null,
      // campos faltantes p/ orientar a curadoria
      missing: [
        !p.imageUrl && "imagem",
        !p.brand && "marca",
        !p.gtin && "gtin",
        !p.category && "categoria",
      ].filter(Boolean) as string[],
    }));
  }

  /** Reenriquece um produto (ou todos os pendentes) via fila BullMQ. */
  async requeue(productId?: string) {
    if (productId) {
      const job = await this.queue.enqueueProduct(productId);
      return { mode: "queued" as const, scope: "product" as const, jobId: job.id };
    }
    const job = await this.queue.enqueuePending();
    return { mode: "queued" as const, scope: "pending" as const, jobId: job.id };
  }

  /** Captura um snapshot de cobertura (cron diário ou manual). */
  async captureSnapshot() {
    const summary = await this.summary();
    return this.prisma.catalogQualitySnapshot.create({
      data: {
        totalProducts: summary.total,
        avgScore: summary.avgScore,
        distribution: summary.distribution as unknown as Prisma.InputJsonValue,
        byStatus: summary.byStatus as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /** Snapshots recentes (métrica ao longo do tempo). */
  snapshots(limit = 30) {
    return this.prisma.catalogQualitySnapshot.findMany({
      orderBy: { capturedAt: "desc" },
      take: Math.min(180, Math.max(1, limit)),
    });
  }

  private buildWhere(filter: { storeId?: string; categoryId?: string }): Prisma.ProductWhereInput {
    return {
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.storeId ? { offers: { some: { storeId: filter.storeId } } } : {}),
    };
  }
}
