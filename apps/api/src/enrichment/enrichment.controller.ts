import { Body, Controller, Get, Post } from "@nestjs/common";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { Roles } from "../auth/decorators/roles.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { EnrichmentService } from "./enrichment.service";
import { EnrichmentQueueService } from "./enrichment.queue";

class EnrichProductDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsBoolean()
  inline?: boolean;
}

class EnrichStoreDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsBoolean()
  inline?: boolean;
}

@Roles("admin")
@Controller("enrichment")
export class EnrichmentController {
  constructor(
    private readonly enrichment: EnrichmentService,
    private readonly queue: EnrichmentQueueService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("product")
  async product(@Body() dto: EnrichProductDto) {
    if (dto.inline) return { mode: "inline", result: await this.enrichment.enrichProduct(dto.productId) };
    const job = await this.queue.enqueueProduct(dto.productId);
    return { mode: "queued", jobId: job.id };
  }

  @Post("store")
  async store(@Body() dto: EnrichStoreDto) {
    if (dto.inline) return { mode: "inline", result: await this.enrichment.enrichStore(dto.storeId) };
    const job = await this.queue.enqueueStore(dto.storeId);
    return { mode: "queued", jobId: job.id };
  }

  @Post("pending")
  async pending() {
    const job = await this.queue.enqueuePending();
    return { mode: "queued", jobId: job.id };
  }

  @Get("mappings")
  mappings() {
    return this.prisma.categoryMapping.findMany({
      include: { category: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
