import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import type { PushMessage } from "./push-provider.interface";

export const PUSH_QUEUE = "push";

export interface PushJobData {
  userId: string;
  message: PushMessage;
}

/**
 * Retry leve com descarte (story 49): push é side-effect não-crítico — poucas
 * tentativas com backoff curto (2s, 4s → janela total ~6s) cobrem blip de rede
 * do provedor; ao esgotar, o job MORRE (sem dead-letter): push atrasado demais
 * (ex.: "pedido pronto" chegando 1h depois) é pior que não chegar.
 */
export const PUSH_JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

/** Enfileira envios de push (story 49) — tira o provedor do caminho quente do request. */
@Injectable()
export class PushQueueService {
  constructor(@InjectQueue(PUSH_QUEUE) private readonly queue: Queue<PushJobData>) {}

  enqueue(userId: string, message: PushMessage) {
    return this.queue.add("send", { userId, message }, PUSH_JOB_OPTS);
  }
}
