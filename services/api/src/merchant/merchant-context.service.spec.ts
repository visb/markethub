import { ForbiddenException } from "@nestjs/common";
import { MerchantService } from "./merchant.service";

/**
 * Story 07: GET /merchant/context resolve o papel efetivo (owner vs manager) e
 * as lojas visíveis. owner = RoleName `merchant` (vê suas lojas); manager =
 * StoreStaff(manager) ativo (vê só as do vínculo); nega quem não é nenhum.
 */
function makeService(staff: { store: { id: string; name: string; merchantId: string } }[]) {
  const prisma = {
    storeStaff: {
      findMany: jest.fn().mockResolvedValue(staff),
    },
  } as never;
  const geocoding = { geocode: jest.fn().mockResolvedValue(null) } as never;
  return new MerchantService(prisma, geocoding);
}

const loja = (id: string, merchantId = "m1") => ({
  store: { id, name: `Loja ${id}`, merchantId },
});

describe("MerchantService.getContext", () => {
  it("owner (RoleName merchant) → role owner com merchantId e lojas", async () => {
    const svc = makeService([loja("s1"), loja("s2")]);
    const ctx = await svc.getContext({ id: "u1", roles: ["merchant"] });
    expect(ctx.role).toBe("owner");
    expect(ctx.merchantId).toBe("m1");
    expect(ctx.stores.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("owner sem lojas ainda → role owner, merchantId null", async () => {
    const svc = makeService([]);
    const ctx = await svc.getContext({ id: "u1", roles: ["merchant"] });
    expect(ctx.role).toBe("owner");
    expect(ctx.merchantId).toBeNull();
    expect(ctx.stores).toEqual([]);
  });

  it("manager (StoreStaff manager, sem RoleName merchant) → role manager só com as lojas do vínculo", async () => {
    const svc = makeService([loja("s9", "m2")]);
    const ctx = await svc.getContext({ id: "u2", roles: ["customer"] });
    expect(ctx.role).toBe("manager");
    expect(ctx.merchantId).toBe("m2");
    expect(ctx.stores.map((s) => s.id)).toEqual(["s9"]);
  });

  it("nega usuário sem RoleName merchant e sem vínculo manager (FORBIDDEN)", async () => {
    const svc = makeService([]);
    await expect(svc.getContext({ id: "u3", roles: ["customer"] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(svc.getContext({ id: "u3", roles: ["customer"] })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "NOT_A_MERCHANT_USER" }),
    });
  });
});
