import type { Job } from "bullmq";
import { PushProcessor } from "./push.processor";
import { PUSH_JOB_OPTS, PushQueueService, type PushJobData } from "./push.queue";
import type { PushMessage } from "./push-provider.interface";

/**
 * Story 49 — fila de push: o enqueue leva userId + message com retry leve e
 * descarte (attempts/backoff curtos, sem dead-letter); o processor delega o
 * envio real à lógica do PushService (deliverToUser) e deixa falha propagar
 * p/ o BullMQ retentar.
 */

const MESSAGE: PushMessage = {
  title: "Pedido pronto",
  body: "Seu pedido está pronto para retirada",
  data: { orderId: "o1" },
};

describe("PushQueueService", () => {
  it("enfileira job 'send' com userId + message e as opts de retry leve", async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const svc = new PushQueueService({ add } as never);

    await svc.enqueue("u1", MESSAGE);

    expect(add).toHaveBeenCalledWith("send", { userId: "u1", message: MESSAGE }, PUSH_JOB_OPTS);
  });

  it("opts declaram poucas tentativas com backoff curto e descarte ao esgotar", () => {
    expect(PUSH_JOB_OPTS.attempts).toBe(3);
    expect(PUSH_JOB_OPTS.backoff).toEqual({ type: "exponential", delay: 2000 });
    // Descarte: sem dead-letter — jobs falhos só ficam num buffer p/ inspeção.
    expect(PUSH_JOB_OPTS.removeOnFail).toBeGreaterThan(0);
    expect(PUSH_JOB_OPTS.removeOnComplete).toBeGreaterThan(0);
  });
});

describe("PushProcessor", () => {
  function makeJob(data: PushJobData) {
    return { data } as unknown as Job<PushJobData>;
  }

  it("delega o envio real ao PushService.deliverToUser", async () => {
    const push = { deliverToUser: jest.fn().mockResolvedValue(undefined) };
    const processor = new PushProcessor(push as never);

    await processor.process(makeJob({ userId: "u1", message: MESSAGE }));

    expect(push.deliverToUser).toHaveBeenCalledWith("u1", MESSAGE);
  });

  it("propaga falha do envio (BullMQ retenta conforme PUSH_JOB_OPTS)", async () => {
    const push = { deliverToUser: jest.fn().mockRejectedValue(new Error("provider caiu")) };
    const processor = new PushProcessor(push as never);

    await expect(
      processor.process(makeJob({ userId: "u1", message: MESSAGE })),
    ).rejects.toThrow("provider caiu");
  });
});
