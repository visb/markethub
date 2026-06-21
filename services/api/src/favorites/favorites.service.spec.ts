import { BadRequestException } from "@nestjs/common";
import { FavoritesService } from "./favorites.service";

/** Foco C09: favoritos idempotentes (upsert/deleteMany) + guarda de oferta. */
function makeService(offer: unknown) {
  const upsert = jest.fn().mockResolvedValue({ userId: "u1", offerId: "of1" });
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    offer: { findUnique: jest.fn().mockResolvedValue(offer) },
    favorite: { upsert, deleteMany },
  } as never;
  return { svc: new FavoritesService(prisma), upsert, deleteMany };
}

describe("FavoritesService", () => {
  it("add lança OFFER_NOT_FOUND quando a oferta não existe", async () => {
    const { svc } = makeService(null);
    await expect(svc.add("u1", "of1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("add faz upsert idempotente (não duplica favorito)", async () => {
    const { svc, upsert } = makeService({ id: "of1" });
    await svc.add("u1", "of1");
    expect(upsert).toHaveBeenCalledWith({
      where: { userId_offerId: { userId: "u1", offerId: "of1" } },
      update: {},
      create: { userId: "u1", offerId: "of1" },
    });
  });

  it("remove é idempotente via deleteMany e retorna removed", async () => {
    const { svc, deleteMany } = makeService({ id: "of1" });
    expect(await svc.remove("u1", "of1")).toEqual({ offerId: "of1", removed: true });
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", offerId: "of1" } });
  });
});
