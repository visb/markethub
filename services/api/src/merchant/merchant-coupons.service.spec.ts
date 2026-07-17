import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { MerchantCouponsService } from "./merchant-coupons.service";

/**
 * Story 53: cupons da REDE (merchant). Escopo via posse de loja (myStores →
 * merchantId); capability owner/admin (manager barrado). Código único/imutável;
 * validações de faixa/janela; delete só sem uso (senão desativa).
 */
function makeService(opts: {
  myStores?: { id: string; name: string; merchantId: string }[];
  level?: "owner" | "admin" | "manager";
  couponRow?: Record<string, unknown> | null;
  existingByCode?: Record<string, unknown> | null;
}) {
  const myStores = opts.myStores ?? [];
  const merchant = {
    myStores: jest.fn().mockResolvedValue(myStores),
    resolveLevel: jest.fn().mockResolvedValue(opts.level ?? "owner"),
  } as never;

  const base = {
    id: "c1",
    code: "BLACK10",
    title: "Black 10%",
    description: null,
    type: "percent",
    value: 10,
    merchantId: "mer1",
    minOrderCents: null,
    validFrom: null,
    validTo: null,
    maxUses: null,
    usedCount: 0,
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    merchant: { name: "Rede A" },
  };

  const couponCreate = jest
    .fn()
    .mockImplementation(({ data }) => Promise.resolve({ ...base, ...data }));
  const couponFindMany = jest.fn().mockResolvedValue([]);
  const couponFindUnique = jest.fn().mockImplementation(({ where }) => {
    if (where.code !== undefined) return Promise.resolve(opts.existingByCode ?? null);
    return Promise.resolve(opts.couponRow ?? null);
  });
  const couponUpdate = jest
    .fn()
    .mockImplementation(({ data }) => Promise.resolve({ ...base, ...opts.couponRow, ...data }));
  const couponDelete = jest.fn().mockResolvedValue({});

  const prisma = {
    coupon: {
      create: couponCreate,
      findMany: couponFindMany,
      findUnique: couponFindUnique,
      update: couponUpdate,
      delete: couponDelete,
    },
  } as never;

  const svc = new MerchantCouponsService(prisma, merchant);
  return { svc, couponCreate, couponFindMany, couponUpdate, couponDelete };
}

const owner = { id: "o1", roles: ["merchant"] };
const storeA = { id: "sA", name: "Loja A", merchantId: "mer1" };
const storeOther = { id: "sB", name: "Loja B", merchantId: "mer2" };
const row = {
  id: "c1",
  code: "BLACK10",
  title: "Black 10%",
  description: null,
  type: "percent",
  value: 10,
  merchantId: "mer1",
  minOrderCents: null,
  validFrom: null,
  validTo: null,
  maxUses: null,
  usedCount: 0,
  active: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  merchant: { name: "Rede A" },
};

describe("MerchantCouponsService (story 53)", () => {
  describe("capability", () => {
    it("manager é barrado → FORBIDDEN (COUPONS_FORBIDDEN)", async () => {
      const { svc } = makeService({ myStores: [storeA], level: "manager" });
      await expect(svc.list(owner)).rejects.toMatchObject({
        response: expect.objectContaining({ code: "COUPONS_FORBIDDEN" }),
      });
    });

    it("admin da loja pode gerir", async () => {
      const { svc, couponFindMany } = makeService({ myStores: [storeA], level: "admin" });
      await svc.list(owner);
      expect(couponFindMany).toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("resolve merchantId do contexto e normaliza o código", async () => {
      const { svc, couponCreate } = makeService({ myStores: [storeA] });
      await svc.create(owner, { code: " verao20 ", title: "Verão 20%", type: "percent", value: 20 });
      expect(couponCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ code: "VERAO20", merchantId: "mer1", value: 20 }),
        }),
      );
    });

    it("persiste title/description (story 73); description ausente vira null", async () => {
      const { svc, couponCreate } = makeService({ myStores: [storeA] });
      const dto = await svc.create(owner, {
        code: "PRIMAVERA",
        title: "Primavera",
        description: "Desconto de primavera",
        type: "percent",
        value: 15,
      });
      expect(couponCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: "Primavera", description: "Desconto de primavera" }),
        }),
      );
      expect(dto).toMatchObject({ title: "Primavera", description: "Desconto de primavera" });

      const { svc: svc2, couponCreate: create2 } = makeService({ myStores: [storeA] });
      await svc2.create(owner, { code: "SEMDESC", title: "Sem descrição", type: "percent", value: 5 });
      expect(create2).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ description: null }) }),
      );
    });

    it("código duplicado → CONFLICT (COUPON_CODE_TAKEN)", async () => {
      const { svc, couponCreate } = makeService({
        myStores: [storeA],
        existingByCode: { id: "other" },
      });
      await expect(
        svc.create(owner, { code: "BLACK10", title: "Black 10%", type: "percent", value: 10 }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: "COUPON_CODE_TAKEN" }) });
      expect(couponCreate).not.toHaveBeenCalled();
    });

    it("percent fora da faixa → BadRequest (COUPON_INVALID_PERCENT)", async () => {
      const { svc, couponCreate } = makeService({ myStores: [storeA] });
      await expect(
        svc.create(owner, { code: "X10", title: "X 10", type: "percent", value: 150 }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "COUPON_INVALID_PERCENT" }),
      });
      expect(couponCreate).not.toHaveBeenCalled();
    });

    it("janela invertida → BadRequest (COUPON_INVALID_WINDOW)", async () => {
      const { svc } = makeService({ myStores: [storeA] });
      await expect(
        svc.create(owner, {
          code: "WIN10",
          title: "Janela 10",
          type: "fixed",
          value: 500,
          validFrom: "2026-02-01T00:00:00.000Z",
          validTo: "2026-01-01T00:00:00.000Z",
        }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: "COUPON_INVALID_WINDOW" }) });
    });

    it("merchantId do body fora do escopo → FORBIDDEN (MERCHANT_NOT_IN_SCOPE)", async () => {
      const { svc } = makeService({ myStores: [storeA] });
      await expect(
        svc.create(owner, { code: "SC10", title: "SC 10", type: "percent", value: 10, merchantId: "alheia" }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: "MERCHANT_NOT_IN_SCOPE" }) });
    });

    it("múltiplas redes sem merchantId → BadRequest (MERCHANT_AMBIGUOUS)", async () => {
      const { svc } = makeService({ myStores: [storeA, storeOther] });
      await expect(
        svc.create(owner, { code: "AMB10", title: "Amb 10", type: "percent", value: 10 }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: "MERCHANT_AMBIGUOUS" }) });
    });

    it("usuário sem rede → FORBIDDEN (NOT_A_MERCHANT_USER)", async () => {
      const { svc } = makeService({ myStores: [] });
      await expect(
        svc.create(owner, { code: "NO10", title: "No 10", type: "percent", value: 10 }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: "NOT_A_MERCHANT_USER" }) });
    });
  });

  describe("list", () => {
    it("lista só as redes do escopo", async () => {
      const { svc, couponFindMany } = makeService({ myStores: [storeA] });
      await svc.list(owner);
      expect(couponFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { merchantId: { in: ["mer1"] } } }),
      );
    });

    it("filtro por rede fora do escopo → FORBIDDEN", async () => {
      const { svc } = makeService({ myStores: [storeA] });
      await expect(svc.list(owner, "mer2")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "MERCHANT_NOT_IN_SCOPE" }),
      });
    });

    it("sem rede → lista vazia", async () => {
      const { svc, couponFindMany } = makeService({ myStores: [] });
      expect(await svc.list(owner)).toEqual([]);
      expect(couponFindMany).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("PATCH parcial altera só o enviado", async () => {
      const { svc, couponUpdate } = makeService({ myStores: [storeA], couponRow: row });
      await svc.update(owner, "c1", { value: 15 });
      expect(couponUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "c1" }, data: { value: 15 } }),
      );
    });

    it("PATCH sem title/description não os apaga; com envio atualiza (story 73)", async () => {
      const { svc, couponUpdate } = makeService({ myStores: [storeA], couponRow: row });
      await svc.update(owner, "c1", { value: 15 });
      const data = couponUpdate.mock.calls[0][0].data;
      expect(data).not.toHaveProperty("title");
      expect(data).not.toHaveProperty("description");

      const { svc: svc2, couponUpdate: update2 } = makeService({ myStores: [storeA], couponRow: row });
      const dto = await svc2.update(owner, "c1", { title: "Renovado", description: "Nova desc" });
      expect(update2).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: "Renovado", description: "Nova desc" }),
        }),
      );
      expect(dto).toMatchObject({ title: "Renovado", description: "Nova desc" });
    });

    it("cupom de outra rede → FORBIDDEN (MERCHANT_NOT_IN_SCOPE)", async () => {
      const { svc } = makeService({
        myStores: [storeA],
        couponRow: { ...row, merchantId: "mer2" },
      });
      await expect(svc.update(owner, "c1", { active: false })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "MERCHANT_NOT_IN_SCOPE" }),
      });
    });

    it("cupom global (merchantId null) → fora do escopo do merchant", async () => {
      const { svc } = makeService({
        myStores: [storeA],
        couponRow: { ...row, merchantId: null },
      });
      await expect(svc.update(owner, "c1", { active: false })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "MERCHANT_NOT_IN_SCOPE" }),
      });
    });

    it("cupom inexistente → NotFound (COUPON_NOT_FOUND)", async () => {
      const { svc } = makeService({ myStores: [storeA], couponRow: null });
      await expect(svc.update(owner, "nope", { active: false })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("maxUses abaixo do usedCount → BadRequest (COUPON_MAX_USES_BELOW_USED)", async () => {
      const { svc } = makeService({
        myStores: [storeA],
        couponRow: { ...row, usedCount: 4 },
      });
      await expect(svc.update(owner, "c1", { maxUses: 2 })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "COUPON_MAX_USES_BELOW_USED" }),
      });
    });

    it("nenhum campo → BadRequest (NO_FIELDS)", async () => {
      const { svc } = makeService({ myStores: [storeA], couponRow: row });
      await expect(svc.update(owner, "c1", {})).rejects.toMatchObject({
        response: expect.objectContaining({ code: "NO_FIELDS" }),
      });
    });
  });

  describe("remove", () => {
    it("sem uso: deleta", async () => {
      const { svc, couponDelete } = makeService({ myStores: [storeA], couponRow: row });
      const res = await svc.remove(owner, "c1");
      expect(couponDelete).toHaveBeenCalledWith({ where: { id: "c1" } });
      expect(res).toMatchObject({ id: "c1", removed: true });
    });

    it("com uso: bloqueia → BadRequest (COUPON_IN_USE)", async () => {
      const { svc, couponDelete } = makeService({
        myStores: [storeA],
        couponRow: { ...row, usedCount: 3 },
      });
      await expect(svc.remove(owner, "c1")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "COUPON_IN_USE" }),
      });
      expect(couponDelete).not.toHaveBeenCalled();
    });

    it("com uso lança BadRequestException", async () => {
      const { svc } = makeService({
        myStores: [storeA],
        couponRow: { ...row, usedCount: 1 },
      });
      await expect(svc.remove(owner, "c1")).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it("conflito de código usa ConflictException", async () => {
    const { svc } = makeService({ myStores: [storeA], existingByCode: { id: "x" } });
    await expect(
      svc.create(owner, { code: "DUP10", title: "Dup 10", type: "percent", value: 10 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
