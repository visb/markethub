import { ForbiddenException } from "@nestjs/common";
import { MerchantService } from "./merchant.service";

/**
 * Story 07 + RBAC story 16: GET /merchant/context resolve o nível efetivo na
 * hierarquia owner > admin > manager e as lojas visíveis. owner = RoleName
 * `merchant` sem vínculo admin; admin = StoreStaff(admin) ativo; manager =
 * StoreStaff(manager) ativo; nega quem não é nenhum.
 */
function makeService(
  staff: { store: { id: string; name: string; merchantId: string } }[],
  opts: { hasAdminLink?: boolean; merchantActive?: boolean } = {},
) {
  const merchantFindUnique = jest
    .fn()
    .mockResolvedValue({ active: opts.merchantActive ?? true });
  const prisma = {
    storeStaff: {
      findMany: jest.fn().mockResolvedValue(staff),
      // resolveLevel: existe vínculo StoreStaff(admin) ativo?
      findFirst: jest.fn().mockResolvedValue(opts.hasAdminLink ? { id: "lnk" } : null),
    },
    // Story 69: getContext lê merchant.active p/ sinalizar rede suspensa.
    merchant: { findUnique: merchantFindUnique },
  } as never;
  const geocoding = { geocode: jest.fn().mockResolvedValue(null) } as never;
  return { svc: new MerchantService(prisma, geocoding, {} as never), merchantFindUnique };
}

const loja = (id: string, merchantId = "m1") => ({
  store: { id, name: `Loja ${id}`, merchantId },
});

describe("MerchantService.getContext", () => {
  it("owner (RoleName merchant) → role owner com merchantId e lojas", async () => {
    const { svc } = makeService([loja("s1"), loja("s2")]);
    const ctx = await svc.getContext({ id: "u1", roles: ["merchant"] });
    expect(ctx.role).toBe("owner");
    expect(ctx.merchantId).toBe("m1");
    expect(ctx.stores.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("owner sem lojas ainda → role owner, merchantId null", async () => {
    const { svc } = makeService([]);
    const ctx = await svc.getContext({ id: "u1", roles: ["merchant"] });
    expect(ctx.role).toBe("owner");
    expect(ctx.merchantId).toBeNull();
    expect(ctx.stores).toEqual([]);
  });

  it("manager (StoreStaff manager, sem RoleName merchant) → role manager só com as lojas do vínculo", async () => {
    const { svc } = makeService([loja("s9", "m2")]);
    const ctx = await svc.getContext({ id: "u2", roles: ["customer"] });
    expect(ctx.role).toBe("manager");
    expect(ctx.merchantId).toBe("m2");
    expect(ctx.stores.map((s) => s.id)).toEqual(["s9"]);
  });

  it("admin (StoreStaff admin ativo) → role admin com as lojas do vínculo (story 16)", async () => {
    const { svc } = makeService([loja("s5", "m3")], { hasAdminLink: true });
    const ctx = await svc.getContext({ id: "u5", roles: ["merchant"] });
    expect(ctx.role).toBe("admin");
    expect(ctx.merchantId).toBe("m3");
    expect(ctx.stores.map((s) => s.id)).toEqual(["s5"]);
  });

  it("hierarquia owner > admin > manager: vínculo admin tem precedência sobre RoleName merchant", async () => {
    const { svc } = makeService([loja("s5")], { hasAdminLink: true });
    const ctx = await svc.getContext({ id: "u5", roles: ["merchant"] });
    expect(ctx.role).toBe("admin"); // não "owner", apesar do RoleName merchant
  });

  it("nega usuário sem RoleName merchant e sem vínculo manager (FORBIDDEN)", async () => {
    const { svc } = makeService([]);
    await expect(svc.getContext({ id: "u3", roles: ["customer"] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(svc.getContext({ id: "u3", roles: ["customer"] })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "NOT_A_MERCHANT_USER" }),
    });
  });

  // ── Story 69: rede suspensa sinalizada no context (tela bloqueante no app) ──
  it("rede ativa → merchantSuspended false", async () => {
    const { svc, merchantFindUnique } = makeService([loja("s1")]);
    const ctx = await svc.getContext({ id: "u1", roles: ["merchant"] });
    expect(ctx.merchantSuspended).toBe(false);
    expect(merchantFindUnique).toHaveBeenCalledWith({
      where: { id: "m1" },
      select: { active: true },
    });
  });

  it("rede suspensa → merchantSuspended true (o staff ainda loga; sem 403)", async () => {
    const { svc } = makeService([loja("s1")], { merchantActive: false });
    const ctx = await svc.getContext({ id: "u1", roles: ["merchant"] });
    expect(ctx.merchantSuspended).toBe(true);
    expect(ctx.role).toBe("owner");
    expect(ctx.stores).toHaveLength(1);
  });

  it("owner sem rede ainda → merchantSuspended false sem consultar merchant", async () => {
    const { svc, merchantFindUnique } = makeService([]);
    const ctx = await svc.getContext({ id: "u1", roles: ["merchant"] });
    expect(ctx.merchantSuspended).toBe(false);
    expect(merchantFindUnique).not.toHaveBeenCalled();
  });
});
