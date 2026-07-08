import type { Job } from "bullmq";
import type { HandlerJobData } from "../event-types";
import {
  isFinalAttempt,
  OrderCanceledEmitirEstornoProcessor,
} from "./order-canceled.processor";
import { PickingDoneVerificarShortfallRefundProcessor } from "./picking-done.processor";

/**
 * Story 48: a marcação `failed` do refund só acontece no ESGOTAMENTO dos
 * retries — o worker do BullMQ emite `failed` a CADA tentativa (attemptsMade já
 * incrementado), então o listener precisa do guard de última tentativa. Cobre o
 * guard (isFinalAttempt) e os listeners dos dois processors de estorno
 * (order-canceled.emitir-estorno e picking-done.verificar-shortfall-refund).
 */

function makeJob(over: { attemptsMade: number; attempts?: number; payload?: unknown }) {
  return {
    attemptsMade: over.attemptsMade,
    opts: { attempts: over.attempts },
    data: {
      eventId: "evt1",
      type: "order.canceled",
      payload: over.payload ?? { orderId: "o1", deliverySlotId: null },
    },
  } as unknown as Job<HandlerJobData>;
}

describe("isFinalAttempt", () => {
  it("falha intermediária (attemptsMade < attempts): não é a última", () => {
    expect(isFinalAttempt(makeJob({ attemptsMade: 1, attempts: 5 }))).toBe(false);
    expect(isFinalAttempt(makeJob({ attemptsMade: 4, attempts: 5 }))).toBe(false);
  });

  it("última tentativa (attemptsMade == attempts): esgotou", () => {
    expect(isFinalAttempt(makeJob({ attemptsMade: 5, attempts: 5 }))).toBe(true);
  });

  it("sem attempts configurado: 1 tentativa única esgota", () => {
    expect(isFinalAttempt(makeJob({ attemptsMade: 1 }))).toBe(true);
  });
});

describe("OrderCanceledEmitirEstornoProcessor.onFailed", () => {
  function makeProcessor() {
    const idempotency = { runOnce: jest.fn().mockResolvedValue(true) };
    const handlers = { estornoEsgotado: jest.fn().mockResolvedValue(undefined) };
    const processor = new OrderCanceledEmitirEstornoProcessor(
      idempotency as never,
      handlers as never,
    );
    return { processor, handlers };
  }

  it("falha intermediária: NÃO marca failed (BullMQ ainda vai retentar)", async () => {
    const { processor, handlers } = makeProcessor();
    await processor.onFailed(makeJob({ attemptsMade: 2, attempts: 5 }));
    expect(handlers.estornoEsgotado).not.toHaveBeenCalled();
  });

  it("retries esgotados: delega a marcação failed ao handler", async () => {
    const { processor, handlers } = makeProcessor();
    await processor.onFailed(makeJob({ attemptsMade: 5, attempts: 5 }));
    expect(handlers.estornoEsgotado).toHaveBeenCalledWith({ orderId: "o1", deliverySlotId: null });
  });

  it("evento failed sem job (edge do worker): no-op", async () => {
    const { processor, handlers } = makeProcessor();
    await processor.onFailed(undefined);
    expect(handlers.estornoEsgotado).not.toHaveBeenCalled();
  });
});

describe("PickingDoneVerificarShortfallRefundProcessor.onFailed", () => {
  function makeProcessor() {
    const idempotency = { runOnce: jest.fn().mockResolvedValue(true) };
    const handlers = { shortfallEsgotado: jest.fn().mockResolvedValue(undefined) };
    const processor = new PickingDoneVerificarShortfallRefundProcessor(
      idempotency as never,
      handlers as never,
    );
    return { processor, handlers };
  }

  it("falha intermediária: NÃO marca failed", async () => {
    const { processor, handlers } = makeProcessor();
    await processor.onFailed(makeJob({ attemptsMade: 1, attempts: 5, payload: { orderGroupId: "g1" } }));
    expect(handlers.shortfallEsgotado).not.toHaveBeenCalled();
  });

  it("retries esgotados: delega a marcação failed ao handler", async () => {
    const { processor, handlers } = makeProcessor();
    await processor.onFailed(makeJob({ attemptsMade: 5, attempts: 5, payload: { orderGroupId: "g1" } }));
    expect(handlers.shortfallEsgotado).toHaveBeenCalledWith({ orderGroupId: "g1" });
  });
});
