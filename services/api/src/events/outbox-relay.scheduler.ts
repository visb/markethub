import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import type { Env } from "../config/env";
import { OUTBOX_RELAY_QUEUE } from "./outbox-relay.processor";

/**
 * Registra o poll do outbox como repeatable job BullMQ (story 45 — decisão:
 * poll, não LISTEN/NOTIFY). Intervalo e on/off via env
 * (OUTBOX_POLL_INTERVAL_MS, OUTBOX_RELAY_ENABLED). upsert = idempotente entre
 * restarts/instâncias.
 */
@Injectable()
export class OutboxRelayScheduler implements OnModuleInit {
  private readonly logger = new Logger(OutboxRelayScheduler.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    @InjectQueue(OUTBOX_RELAY_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get("OUTBOX_RELAY_ENABLED", { infer: true })) {
      this.logger.log("Outbox relay disabled (OUTBOX_RELAY_ENABLED=false)");
      return;
    }
    const every = this.config.get("OUTBOX_POLL_INTERVAL_MS", { infer: true });
    await this.queue.upsertJobScheduler("outbox-relay-poll", { every }, { name: "poll" });
    this.logger.log(`Outbox relay poll enabled: every ${every}ms`);
  }
}
