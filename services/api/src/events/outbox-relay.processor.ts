import { Processor, WorkerHost } from "@nestjs/bullmq";
import { OutboxRelayService } from "./outbox-relay.service";

export const OUTBOX_RELAY_QUEUE = "outbox-relay";

/**
 * Consome o tick do poll do outbox (repeatable job registrado no
 * OutboxRelayScheduler) e delega ao OutboxRelayService. Casca fina — a lógica
 * (e os testes) vivem no service.
 */
@Processor(OUTBOX_RELAY_QUEUE)
export class OutboxRelayProcessor extends WorkerHost {
  constructor(private readonly relay: OutboxRelayService) {
    super();
  }

  async process(): Promise<void> {
    await this.relay.relayPending();
  }
}
