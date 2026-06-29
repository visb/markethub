import { NotFoundException } from "@nestjs/common";
import { StoreFollowsService } from "./store-follows.service";

/**
 * Story 34: seguir loja idempotente (upsert/deleteMany) + guarda de loja, espelho
 * de `favorites.service.spec`. Prisma fake via `jest.fn()` (sem DB). `list` e
 * `isFollowing` são casos novos (findMany/findUnique).
 */
function makeService(opts: {
  store?: unknown;
  followRows?: unknown[];
  followRow?: unknown;
} = {}) {
  const upsert = jest.fn().mockResolvedValue({ userId: "u1", storeId: "s1" });
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const findMany = jest.fn().mockResolvedValue(opts.followRows ?? []);
  const findUnique = jest.fn().mockResolvedValue(opts.followRow ?? null);
  const prisma = {
    store: { findUnique: jest.fn().mockResolvedValue(opts.store ?? null) },
    storeFollow: { upsert, deleteMany, findMany, findUnique },
  } as never;
  return { svc: new StoreFollowsService(prisma), upsert, deleteMany, findMany, findUnique };
}

describe("StoreFollowsService", () => {
  it("follow lança STORE_NOT_FOUND quando a loja não existe", async () => {
    const { svc } = makeService({ store: null });
    await expect(svc.follow("u1", "s1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("follow faz upsert idempotente (não duplica)", async () => {
    const { svc, upsert } = makeService({ store: { id: "s1" } });
    await svc.follow("u1", "s1");
    expect(upsert).toHaveBeenCalledWith({
      where: { userId_storeId: { userId: "u1", storeId: "s1" } },
      update: {},
      create: { userId: "u1", storeId: "s1" },
    });
  });

  it("unfollow é idempotente via deleteMany e retorna removed", async () => {
    const { svc, deleteMany } = makeService({ store: { id: "s1" } });
    expect(await svc.unfollow("u1", "s1")).toEqual({ storeId: "s1", removed: true });
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", storeId: "s1" } });
  });

  it("list retorna lojas seguidas (createdAt desc) com nome/logo da rede", async () => {
    const { svc, findMany } = makeService({
      followRows: [
        {
          storeId: "s1",
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
          store: { id: "s1", name: "Loja A", merchant: { name: "Rede A", logoUrl: "a.png" } },
        },
      ],
    });
    const res = await svc.list("u1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" }, orderBy: { createdAt: "desc" } }),
    );
    expect(res).toEqual([
      {
        storeId: "s1",
        createdAt: "2026-02-01T00:00:00.000Z",
        store: { id: "s1", name: "Loja A", merchantName: "Rede A", merchantLogoUrl: "a.png" },
      },
    ]);
  });

  it("isFollowing → true quando há vínculo", async () => {
    const { svc, findUnique } = makeService({ followRow: { id: "f1" } });
    expect(await svc.isFollowing("u1", "s1")).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId_storeId: { userId: "u1", storeId: "s1" } },
    });
  });

  it("isFollowing → false quando não há vínculo", async () => {
    const { svc } = makeService({ followRow: null });
    expect(await svc.isFollowing("u1", "s1")).toBe(false);
  });
});
