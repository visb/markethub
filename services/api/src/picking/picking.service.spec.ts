import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PickingService } from "./picking.service";

/**
 * Foco C06: atribuição da PickTask — RBAC de separador, guarda de status e o
 * lock otimista (compare-and-swap via updateMany) que evita 2 pickers pegando
 * a mesma tarefa. + release (dono/estado).
 */

const TASK_WITH_RELS = {
  id: "t1",
  orderGroupId: "g1",
  storeId: "s1",
  pickerId: "u1",
  status: "assigned",
  assignedAt: new Date("2026-01-01"),
  startedAt: null,
  packedAt: null,
  readyAt: null,
  createdAt: new Date("2026-01-01"),
  items: [],
  orderGroup: { fulfillment: "delivery", pickupCode: null, order: { scheduledFrom: null } },
};

function makeService(opts: {
  task?: Record<string, unknown> | null;
  staff?: unknown;
  updateManyCount?: number;
  findMany?: unknown[];
}) {
  const taskStatusChanged = jest.fn();
  const updateMany = jest.fn().mockResolvedValue({ count: opts.updateManyCount ?? 1 });
  const update = jest.fn().mockResolvedValue({});
  const findMany = jest.fn().mockResolvedValue(opts.findMany ?? []);
  const prisma = {
    pickTask: {
      findUnique: jest.fn().mockResolvedValue("task" in opts ? opts.task : { ...TASK_WITH_RELS }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(TASK_WITH_RELS),
      findMany,
      updateMany,
      update,
    },
    storeStaff: {
      findFirst: jest.fn().mockResolvedValue("staff" in opts ? opts.staff : { id: "st1" }),
    },
  } as never;
  const events = { taskStatusChanged } as never;
  const svc = new PickingService(prisma, events);
  return { svc, updateMany, update, findMany, taskStatusChanged };
}

/** Cria uma PickTask-like p/ os testes de ordenação de listQueue. */
function makeTask(opts: {
  id: string;
  status?: string;
  pickerId?: string | null;
  createdAt: string;
  scheduledFrom?: string | null;
}) {
  return {
    ...TASK_WITH_RELS,
    id: opts.id,
    status: opts.status ?? "queued",
    pickerId: opts.pickerId ?? null,
    createdAt: new Date(opts.createdAt),
    orderGroup: {
      ...TASK_WITH_RELS.orderGroup,
      order: { scheduledFrom: opts.scheduledFrom ? new Date(opts.scheduledFrom) : null },
    },
  };
}

describe("PickingService.assign", () => {
  it("PICK_TASK_NOT_FOUND quando a tarefa não existe", async () => {
    const { svc } = makeService({ task: null });
    await expect(svc.assign("u1", "t1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("NOT_STORE_PICKER quando o usuário não é separador da loja", async () => {
    const { svc } = makeService({ task: { ...TASK_WITH_RELS, status: "queued" }, staff: null });
    await expect(svc.assign("u1", "t1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("PICK_TASK_NOT_QUEUED quando a tarefa não está na fila", async () => {
    const { svc, updateMany } = makeService({ task: { ...TASK_WITH_RELS, status: "assigned" } });
    await expect(svc.assign("u1", "t1")).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("corrida: CAS retorna count 0 → outro picker assumiu", async () => {
    const { svc } = makeService({
      task: { ...TASK_WITH_RELS, status: "queued", pickerId: null },
      updateManyCount: 0,
    });
    await expect(svc.assign("u1", "t1")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "PICK_TASK_NOT_QUEUED" }),
    });
  });

  it("sucesso: CAS count 1 → atribui e emite evento", async () => {
    const { svc, updateMany, taskStatusChanged } = makeService({
      task: { ...TASK_WITH_RELS, status: "queued", pickerId: null },
      updateManyCount: 1,
    });
    const dto = await svc.assign("u1", "t1");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "t1", status: "queued", pickerId: null },
      data: expect.objectContaining({ status: "assigned", pickerId: "u1" }),
    });
    expect(taskStatusChanged).toHaveBeenCalled();
    expect(dto.id).toBe("t1");
  });
});

describe("PickingService.listQueue — ordenação (story 01)", () => {
  it("queued (mais nova) vem antes de assigned minha (mais antiga): status manda entre grupos", async () => {
    const { svc } = makeService({
      findMany: [
        makeTask({ id: "mine", status: "assigned", pickerId: "u1", createdAt: "2026-01-01T08:00:00Z" }),
        makeTask({ id: "new", status: "queued", createdAt: "2026-01-01T10:00:00Z" }),
      ],
    });
    const queue = await svc.listQueue("u1", "s1");
    expect(queue.map((t) => t.id)).toEqual(["new", "mine"]);
  });

  it("duas queued: FIFO interno preservado (mais antiga primeiro)", async () => {
    const { svc } = makeService({
      findMany: [
        makeTask({ id: "newer", status: "queued", createdAt: "2026-01-01T10:00:00Z" }),
        makeTask({ id: "older", status: "queued", createdAt: "2026-01-01T08:00:00Z" }),
      ],
    });
    const queue = await svc.listQueue("u1", "s1");
    expect(queue.map((t) => t.id)).toEqual(["older", "newer"]);
  });

  it("duas assigned minhas: FIFO interno preservado", async () => {
    const { svc } = makeService({
      findMany: [
        makeTask({ id: "newer", status: "assigned", pickerId: "u1", createdAt: "2026-01-01T10:00:00Z" }),
        makeTask({ id: "older", status: "assigned", pickerId: "u1", createdAt: "2026-01-01T08:00:00Z" }),
      ],
    });
    const queue = await svc.listQueue("u1", "s1");
    expect(queue.map((t) => t.id)).toEqual(["older", "newer"]);
  });

  it("dentro do grupo queued respeita effective (scheduledFrom) vs createdAt", async () => {
    const { svc } = makeService({
      findMany: [
        // imediata: createdAt cedo, sem janela
        makeTask({ id: "immediate", status: "queued", createdAt: "2026-01-01T09:00:00Z" }),
        // agendada: createdAt depois, mas janela ainda mais cedo → vem antes
        makeTask({
          id: "scheduled",
          status: "queued",
          createdAt: "2026-01-01T11:00:00Z",
          scheduledFrom: "2026-01-01T07:00:00Z",
        }),
      ],
    });
    const queue = await svc.listQueue("u1", "s1");
    expect(queue.map((t) => t.id)).toEqual(["scheduled", "immediate"]);
  });
});

describe("PickingService.release", () => {
  it("NOT_TASK_OWNER quando não é o dono", async () => {
    const { svc } = makeService({ task: { ...TASK_WITH_RELS, pickerId: "outro" } });
    await expect(svc.release("u1", "t1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("PICK_TASK_NOT_ASSIGNED quando já iniciada", async () => {
    const { svc } = makeService({ task: { ...TASK_WITH_RELS, pickerId: "u1", status: "picking" } });
    await expect(svc.release("u1", "t1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("sucesso: volta para queued e limpa o picker", async () => {
    const { svc, update } = makeService({
      task: { ...TASK_WITH_RELS, pickerId: "u1", status: "assigned" },
    });
    await svc.release("u1", "t1");
    expect(update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { status: "queued", pickerId: null, assignedAt: null },
    });
  });
});
