import type { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import type { Env } from "../config/env";
import type { HandlerJobData } from "./event-types";
import { OutboxRelayService } from "./outbox-relay.service";
import {
  ORDER_PAID_GERAR_PICKING,
  ORDER_PAID_NOTIFICAR,
  ORDER_PAID_PUSH_ERP,
} from "./subscriptions";

/**
 * Story 45: relay do outbox — lê SÓ pendentes (publishedAt = null), faz fan-out
 * de 1 job POR HANDLER inscrito (retry isolado; não 1 job por evento), jobId
 * determinístico (dedupe no BullMQ), marca publishedAt e respeita o lote.
 */

interface OutboxRow {
  id: string;
  type: string;
  payload: unknown;
  aggregateId: string;
  createdAt: Date;
  publishedAt: Date | null;
}

function makeEvent(over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: "evt1",
    type: "order.paid",
    payload: { orderId: "order1" },
    aggregateId: "order1",
    createdAt: new Date("2026-07-07T10:00:00Z"),
    publishedAt: null,
    ...over,
  };
}

function makeRelay(opts: { pending?: OutboxRow[]; batchSize?: number; queues?: string[] } = {}) {
  const findMany = jest.fn().mockResolvedValue(opts.pending ?? []);
  const update = jest.fn().mockResolvedValue({});
  const prisma = { outboxEvent: { findMany, update } } as never;

  const queueNames = opts.queues ?? [ORDER_PAID_PUSH_ERP, ORDER_PAID_GERAR_PICKING, ORDER_PAID_NOTIFICAR];
  const adds = new Map<string, jest.Mock>();
  const queues = new Map<string, Queue<HandlerJobData>>();
  for (const name of queueNames) {
    const add = jest.fn().mockResolvedValue({});
    adds.set(name, add);
    queues.set(name, { add } as unknown as Queue<HandlerJobData>);
  }

  const config = {
    get: jest.fn().mockReturnValue(opts.batchSize ?? 50),
  } as unknown as ConfigService<Env, true>;

  const svc = new OutboxRelayService(prisma, queues, config);
  return { svc, findMany, update, adds };
}

describe("OutboxRelayService.relayPending", () => {
  it("busca só pendentes (publishedAt=null), em ordem de criação, limitado ao lote", async () => {
    const { svc, findMany } = makeRelay({ batchSize: 7 });
    await svc.relayPending();
    expect(findMany).toHaveBeenCalledWith({
      where: { publishedAt: null },
      orderBy: { createdAt: "asc" },
      take: 7,
    });
  });

  it("fan-out: 1 job POR HANDLER inscrito (não 1 por evento), com jobId determinístico", async () => {
    const { svc, adds, update } = makeRelay({ pending: [makeEvent()] });

    const res = await svc.relayPending();

    expect(res).toEqual({ events: 1, jobs: 3 });
    for (const handler of [ORDER_PAID_PUSH_ERP, ORDER_PAID_GERAR_PICKING, ORDER_PAID_NOTIFICAR]) {
      const add = adds.get(handler)!;
      expect(add).toHaveBeenCalledTimes(1);
      expect(add).toHaveBeenCalledWith(
        "order.paid",
        { eventId: "evt1", type: "order.paid", payload: { orderId: "order1" } },
        expect.objectContaining({ jobId: `evt1:${handler}` }),
      );
    }
    expect(update).toHaveBeenCalledWith({
      where: { id: "evt1" },
      data: { publishedAt: expect.any(Date) },
    });
  });

  it("marca publishedAt DEPOIS de enfileirar (crash entre os dois → reenfileira, jobId dedupa)", async () => {
    const order: string[] = [];
    const { svc, adds, update } = makeRelay({ pending: [makeEvent()] });
    for (const [name, add] of adds) add.mockImplementation(async () => order.push(`add:${name}`));
    update.mockImplementation(async () => order.push("update"));

    await svc.relayPending();

    expect(order[order.length - 1]).toBe("update");
    expect(order.filter((s) => s.startsWith("add:"))).toHaveLength(3);
  });

  it("lote vazio: nada publicado, nenhum job", async () => {
    const { svc, update, adds } = makeRelay({ pending: [] });
    const res = await svc.relayPending();
    expect(res).toEqual({ events: 0, jobs: 0 });
    expect(update).not.toHaveBeenCalled();
    for (const add of adds.values()) expect(add).not.toHaveBeenCalled();
  });

  it("evento de tipo sem subscriber: marca publicado sem enfileirar (não trava o poll)", async () => {
    const { svc, update, adds } = makeRelay({ pending: [makeEvent({ type: "tipo.desconhecido" })] });
    const res = await svc.relayPending();
    expect(res).toEqual({ events: 1, jobs: 0 });
    expect(update).toHaveBeenCalledTimes(1);
    for (const add of adds.values()) expect(add).not.toHaveBeenCalled();
  });

  it("handler inscrito sem fila registrada: lança e NÃO marca publicado (evento não se perde)", async () => {
    const { svc, update } = makeRelay({ pending: [makeEvent()], queues: [] });
    await expect(svc.relayPending()).rejects.toThrow(/sem fila registrada/);
    expect(update).not.toHaveBeenCalled();
  });

  it("processa vários eventos do lote em sequência", async () => {
    const e1 = makeEvent({ id: "evt1", payload: { orderId: "o1" }, aggregateId: "o1" });
    const e2 = makeEvent({ id: "evt2", payload: { orderId: "o2" }, aggregateId: "o2" });
    const { svc, update } = makeRelay({ pending: [e1, e2] });
    const res = await svc.relayPending();
    expect(res).toEqual({ events: 2, jobs: 6 });
    expect(update).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: "evt1" } }));
    expect(update).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { id: "evt2" } }));
  });
});
