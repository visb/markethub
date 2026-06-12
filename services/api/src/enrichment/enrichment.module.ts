import { BullModule } from "@nestjs/bullmq";
import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { CatalogQualityController } from "./catalog-quality.controller";
import { CatalogQualityService } from "./catalog-quality.service";
import { CATEGORY_MAPPER } from "./category-mapper.interface";
import { EnrichmentController } from "./enrichment.controller";
import { EnrichmentProcessor } from "./enrichment.processor";
import { ENRICHMENT_QUEUE, EnrichmentQueueService } from "./enrichment.queue";
import { EnrichmentService } from "./enrichment.service";
import { HeuristicCategoryMapper } from "./mappers/heuristic.mapper";
import { ENRICHMENT_PROVIDER } from "./provider.interface";
import { CosmosEnrichmentProvider } from "./providers/cosmos.provider";
import { MockEnrichmentProvider } from "./providers/mock.provider";

@Module({
  imports: [BullModule.registerQueue({ name: ENRICHMENT_QUEUE })],
  controllers: [EnrichmentController, CatalogQualityController],
  providers: [
    EnrichmentService,
    EnrichmentQueueService,
    EnrichmentProcessor,
    CatalogQualityService,
    // Cosmos se houver COSMOS_TOKEN; senão Mock (dev/test).
    {
      provide: ENRICHMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const token = config.get("COSMOS_TOKEN", { infer: true });
        if (token) {
          new Logger("EnrichmentModule").log("Using Cosmos enrichment provider");
          return new CosmosEnrichmentProvider(config);
        }
        new Logger("EnrichmentModule").warn("No COSMOS_TOKEN — using Mock enrichment provider");
        return new MockEnrichmentProvider();
      },
    },
    // Mapeador de categoria: heurístico agora; AiCategoryMapper entra depois (mesma interface).
    { provide: CATEGORY_MAPPER, useClass: HeuristicCategoryMapper },
  ],
  exports: [EnrichmentService, EnrichmentQueueService],
})
export class EnrichmentModule {}
