import type { Prisma } from "@prisma/client";
import { OutboxPublisher } from "./outbox.publisher";

/**
 * Story 45: o publisher grava a row OutboxEvent usando o CLIENT TRANSACIONAL
 * recebido (participa da TX do agregado — atomicidade), com type/payload/
 * aggregateId corretos e publishedAt pendente (default do schema, não setado).
 */

function makeTx() {
  const create = jest.fn().mockResolvedValue({ id: "evt1" });
  const tx = { outboxEvent: { create } } as unknown as Prisma.TransactionClient;
  return { tx, create };
}

describe("OutboxPublisher.publish", () => {
  it("grava OutboxEvent no client transacional recebido (mesma TX)", async () => {
    const { tx, create } = makeTx();
    const publisher = new OutboxPublisher();

    const row = await publisher.publish(tx, {
      type: "order.paid",
      payload: { orderId: "order1" },
      aggregateId: "order1",
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        type: "order.paid",
        payload: { orderId: "order1" },
        aggregateId: "order1",
      },
    });
    expect(row).toEqual({ id: "evt1" });
  });

  it("não seta publishedAt na criação (evento nasce pendente p/ o relay)", async () => {
    const { tx, create } = makeTx();
    await new OutboxPublisher().publish(tx, {
      type: "order.paid",
      payload: { orderId: "o2" },
      aggregateId: "o2",
    });
    const arg = create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data).not.toHaveProperty("publishedAt");
  });
});
