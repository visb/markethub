import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ErpModule } from "../erp/erp.module";
import { HttpWebhookSender } from "./http-webhook-sender";
import { IntegrationController } from "./integration.controller";
import { IntegrationService } from "./integration.service";
import { WEBHOOK_SENDER } from "./webhook-sender.interface";
import { WEBHOOK_QUEUE, WebhookQueueService } from "./webhook.queue";
import { WebhookProcessor } from "./webhook.processor";

/**
 * Módulo de integração do merchant (story 09): ERP config, api-keys de entrada e
 * webhooks de saída assinados (entrega via fila BullMQ). O envio HTTP fica atrás
 * da interface WebhookSender (mockável nos testes). Exporta IntegrationService
 * p/ o domínio de pedidos emitir order.created / order.status_changed.
 */
@Module({
  imports: [BullModule.registerQueue({ name: WEBHOOK_QUEUE }), ErpModule],
  controllers: [IntegrationController],
  providers: [
    IntegrationService,
    WebhookQueueService,
    WebhookProcessor,
    { provide: WEBHOOK_SENDER, useClass: HttpWebhookSender },
  ],
  exports: [IntegrationService],
})
export class IntegrationModule {}
