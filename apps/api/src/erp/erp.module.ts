import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { EnrichmentModule } from "../enrichment/enrichment.module";
import { ConnectorRegistry } from "./connector-registry";
import { ERP_CONNECTORS, type ErpConnector } from "./connector.interface";
import { CsvErpConnector } from "./connectors/csv.connector";
import { ErpController } from "./erp.controller";
import { ErpProcessor } from "./erp.processor";
import { ERP_QUEUE, ErpQueueService } from "./erp.queue";
import { ErpScheduler } from "./erp.scheduler";
import { ErpService } from "./erp.service";

@Module({
  imports: [
    BullModule.registerQueue({ name: ERP_QUEUE }),
    ScheduleModule.forRoot(),
    EnrichmentModule,
  ],
  controllers: [ErpController],
  providers: [
    ErpService,
    ConnectorRegistry,
    ErpQueueService,
    ErpProcessor,
    ErpScheduler,
    CsvErpConnector,
    // Conectores concretos registrados aqui. Novos ERPs entram nesta lista.
    {
      provide: ERP_CONNECTORS,
      useFactory: (csv: CsvErpConnector): ErpConnector[] => [csv],
      inject: [CsvErpConnector],
    },
  ],
  exports: [ErpService, ErpQueueService],
})
export class ErpModule {}
