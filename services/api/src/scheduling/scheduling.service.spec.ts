import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { SchedulingService } from "./scheduling.service";

/**
 * Foco C08: capacidade/slots de agendamento (S5.3) — listAvailable (filtra slot
 * com vaga), create (validação de janela/capacidade + RBAC manager), deleteSlot
 * (bloqueia com reserva) e a reserva atômica reserveInTx (CAS) + release (piso 0).
 */

function makeService(opts: {
  slots?: unknown[];
  slot?: Record<string, unknown> | null;
  staff?: unknown;
}) {
  const upsert = jest.fn().mockResolvedValue({ id: "slot1" });
  const del = jest.fn().mockResolvedValue({});
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    deliverySlot: {
      findMany: jest.fn().mockResolvedValue(opts.slots ?? []),
      findUnique: jest.fn().mockResolvedValue("slot" in opts ? opts.slot : null),
      upsert,
      delete: del,
      updateMany,
    },
    storeStaff: { findFirst: jest.fn().mockResolvedValue("staff" in opts ? opts.staff : { id: "s" }) },
  } as never;
  const svc = new SchedulingService(prisma);
  return { svc, upsert, del, updateMany };
}

const slotDate = (h: number) => new Date(`2026-07-01T${String(h).padStart(2, "0")}:00:00Z`);

describe("SchedulingService.listAvailable", () => {
  it("retorna só slots com vaga e calcula remaining", async () => {
    const { svc } = makeService({
      slots: [
        { id: "a", storeId: "st1", start: slotDate(10), end: slotDate(11), capacity: 5, reserved: 2 },
        { id: "b", storeId: "st1", start: slotDate(11), end: slotDate(12), capacity: 3, reserved: 3 }, // cheio
      ],
    });
    const r = await svc.listAvailable("st1");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "a", remaining: 3 });
  });
});

describe("SchedulingService.create", () => {
  const valid = { storeId: "st1", start: "2026-07-01T10:00:00Z", end: "2026-07-01T11:00:00Z", capacity: 5 };

  it("NOT_STORE_MANAGER quando não é manager nem admin", async () => {
    const { svc } = makeService({ staff: null });
    await expect(svc.create("u1", ["customer"], valid)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("admin ignora a checagem de staff", async () => {
    const { svc, upsert } = makeService({ staff: null });
    await svc.create("u1", ["admin"], valid);
    expect(upsert).toHaveBeenCalled();
  });

  it("INVALID_SLOT_WINDOW quando end <= start", async () => {
    const { svc } = makeService({});
    await expect(
      svc.create("u1", ["admin"], { ...valid, end: "2026-07-01T09:00:00Z" }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "INVALID_SLOT_WINDOW" }) });
  });

  it("INVALID_CAPACITY quando capacidade <= 0 ou não-inteira", async () => {
    const { svc } = makeService({});
    await expect(svc.create("u1", ["admin"], { ...valid, capacity: 0 })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "INVALID_CAPACITY" }),
    });
  });
});

describe("SchedulingService.deleteSlot", () => {
  it("SLOT_NOT_FOUND quando o slot não existe", async () => {
    const { svc } = makeService({ slot: null });
    await expect(svc.deleteSlot("u1", ["admin"], "x")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("SLOT_HAS_RESERVATIONS quando já há reserva", async () => {
    const { svc, del } = makeService({ slot: { id: "s1", storeId: "st1", reserved: 1 } });
    await expect(svc.deleteSlot("u1", ["admin"], "s1")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "SLOT_HAS_RESERVATIONS" }),
    });
    expect(del).not.toHaveBeenCalled();
  });

  it("remove quando sem reserva", async () => {
    const { svc, del } = makeService({ slot: { id: "s1", storeId: "st1", reserved: 0 } });
    expect(await svc.deleteSlot("u1", ["admin"], "s1")).toEqual({ removed: true });
    expect(del).toHaveBeenCalledWith({ where: { id: "s1" } });
  });
});

describe("SchedulingService.reserveInTx", () => {
  function makeTx(slot: Record<string, unknown> | null, count: number) {
    const updateMany = jest.fn().mockResolvedValue({ count });
    const tx = {
      deliverySlot: { findUnique: jest.fn().mockResolvedValue(slot), updateMany },
    } as never;
    return { tx, updateMany };
  }

  it("SLOT_NOT_FOUND quando o slot não pertence às lojas do carrinho", async () => {
    const { svc } = makeService({});
    const { tx } = makeTx({ id: "sl1", storeId: "outra", capacity: 5 }, 1);
    await expect(svc.reserveInTx(tx, "sl1", ["st1"])).rejects.toMatchObject({
      response: expect.objectContaining({ code: "SLOT_NOT_FOUND" }),
    });
  });

  it("SLOT_FULL quando o CAS não consegue incrementar (lotado)", async () => {
    const { svc } = makeService({});
    const { tx } = makeTx({ id: "sl1", storeId: "st1", capacity: 5 }, 0);
    await expect(svc.reserveInTx(tx, "sl1", ["st1"])).rejects.toMatchObject({
      response: expect.objectContaining({ code: "SLOT_FULL" }),
    });
  });

  it("sucesso: incrementa reserved e retorna a janela", async () => {
    const { svc } = makeService({});
    const start = slotDate(10);
    const end = slotDate(11);
    const { tx, updateMany } = makeTx({ id: "sl1", storeId: "st1", capacity: 5, start, end }, 1);
    const r = await svc.reserveInTx(tx, "sl1", ["st1"]);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "sl1", reserved: { lt: 5 } },
      data: { reserved: { increment: 1 } },
    });
    expect(r).toEqual({ start, end });
  });
});

describe("SchedulingService.release", () => {
  it("decrementa com piso 0 (guarda reserved > 0)", async () => {
    const { svc, updateMany } = makeService({});
    await svc.release("sl1");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "sl1", reserved: { gt: 0 } },
      data: { reserved: { decrement: 1 } },
    });
  });
});
