import { Prisma } from "@prisma/client";
import { EventIdempotencyService } from "./event-idempotency.service";

/**
 * Story 45: trava de idempotência dos handlers (dedupe eventId+handler via
 * unique do ProcessedEvent). Primeira execução insere a trava e roda o efeito;
 * reentrega (violação P2002) faz short-circuit sem efeito; falha do efeito
 * libera a trava p/ o retry do BullMQ reexecutar.
 */

function p2002() {
  return new Prisma.PrismaClientKnownRequestError("unique violation", {
    code: "P2002",
    clientVersion: "test",
  });
}

function makeService(opts: { createError?: Error } = {}) {
  const create = opts.createError
    ? jest.fn().mockRejectedValue(opts.createError)
    : jest.fn().mockResolvedValue({});
  const del = jest.fn().mockResolvedValue({});
  const prisma = { processedEvent: { create, delete: del } } as never;
  return { svc: new EventIdempotencyService(prisma), create, del };
}

describe("EventIdempotencyService.runOnce", () => {
  it("primeira execução: insere ProcessedEvent(eventId, handler) e roda o efeito", async () => {
    const { svc, create, del } = makeService();
    const effect = jest.fn().mockResolvedValue(undefined);

    const ran = await svc.runOnce("evt1", "order-paid.push-erp", effect);

    expect(ran).toBe(true);
    expect(create).toHaveBeenCalledWith({ data: { eventId: "evt1", handler: "order-paid.push-erp" } });
    expect(effect).toHaveBeenCalledTimes(1);
    expect(del).not.toHaveBeenCalled();
  });

  it("reentrega (unique P2002): short-circuit sem repetir o efeito", async () => {
    const { svc } = makeService({ createError: p2002() });
    const effect = jest.fn();

    const ran = await svc.runOnce("evt1", "order-paid.push-erp", effect);

    expect(ran).toBe(false);
    expect(effect).not.toHaveBeenCalled();
  });

  it("erro de banco que NÃO é P2002 propaga (não mascara como dedupe)", async () => {
    const { svc } = makeService({ createError: new Error("db down") });
    const effect = jest.fn();
    await expect(svc.runOnce("evt1", "h", effect)).rejects.toThrow("db down");
    expect(effect).not.toHaveBeenCalled();
  });

  it("efeito falhou: libera a trava (delete) e relança p/ o retry do BullMQ", async () => {
    const { svc, del } = makeService();
    const effect = jest.fn().mockRejectedValue(new Error("erp indisponível"));

    await expect(svc.runOnce("evt1", "order-paid.push-erp", effect)).rejects.toThrow("erp indisponível");
    expect(del).toHaveBeenCalledWith({
      where: { eventId_handler: { eventId: "evt1", handler: "order-paid.push-erp" } },
    });
  });

  it("falha ao liberar a trava não engole o erro original do efeito", async () => {
    const { svc, del } = makeService();
    del.mockRejectedValue(new Error("delete falhou"));
    const effect = jest.fn().mockRejectedValue(new Error("efeito falhou"));
    await expect(svc.runOnce("evt1", "h", effect)).rejects.toThrow("efeito falhou");
  });
});
