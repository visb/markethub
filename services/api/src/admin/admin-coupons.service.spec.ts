import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { AdminCouponsService } from "./admin-coupons.service";

/**
 * Story 53: cupons pelo admin — vê todos (globais + por rede, filtro), cria globais
 * ou atrelados a uma rede. Código único/imutável; delete só sem uso.
 */
function makeService(opts: {
  couponRow?: Record<string, unknown> | null;
  existingByCode?: Record<string, unknown> | null;
  merchantExists?: boolean;
}) {
  const base = {
    id: "c1",
    code: "GLOBAL10",
    type: "percent",
    value: 10,
    merchantId: null,
    minOrderCents: null,
    validFrom: null,
    validTo: null,
    maxUses: null,
    usedCount: 0,
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    merchant: null,
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
  const merchantFindUnique = jest
    .fn()
    .mockResolvedValue(opts.merchantExists === false ? null : { id: "mer1", name: "Rede A" });

  const prisma = {
    coupon: {
      create: couponCreate,
      findMany: couponFindMany,
      findUnique: couponFindUnique,
      update: couponUpdate,
      delete: couponDelete,
    },
    merchant: { findUnique: merchantFindUnique },
  } as never;

  const svc = new AdminCouponsService(prisma);
  return { svc, couponCreate, couponFindMany, couponUpdate, couponDelete, merchantFindUnique };
}

const row = {
  id: "c1",
  code: "GLOBAL10",
  type: "percent",
  value: 10,
  merchantId: null,
  minOrderCents: null,
  validFrom: null,
  validTo: null,
  maxUses: null,
  usedCount: 0,
  active: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  merchant: null,
};

describe("AdminCouponsService (story 53)", () => {
  describe("list", () => {
    it("sem filtro: lista todos (where undefined)", async () => {
      const { svc, couponFindMany } = makeService({});
      await svc.list();
      expect(couponFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });

    it("filtro 'global' → merchantId null", async () => {
      const { svc, couponFindMany } = makeService({});
      await svc.list("global");
      expect(couponFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { merchantId: null } }),
      );
    });

    it("filtro por rede → merchantId igual", async () => {
      const { svc, couponFindMany } = makeService({});
      await svc.list("mer1");
      expect(couponFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { merchantId: "mer1" } }),
      );
    });
  });

  describe("create", () => {
    it("cria global (merchantId null) por padrão e normaliza código", async () => {
      const { svc, couponCreate } = makeService({});
      await svc.create({ code: " nATAL ", type: "fixed", value: 1000 });
      expect(couponCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ code: "NATAL", merchantId: null, value: 1000 }),
        }),
      );
    });

    it("cria atrelado a uma rede existente", async () => {
      const { svc, couponCreate, merchantFindUnique } = makeService({ merchantExists: true });
      await svc.create({ code: "REDE10", type: "percent", value: 10, merchantId: "mer1" });
      expect(merchantFindUnique).toHaveBeenCalledWith({ where: { id: "mer1" } });
      expect(couponCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ merchantId: "mer1" }) }),
      );
    });

    it("rede inexistente → NotFound (MERCHANT_NOT_FOUND)", async () => {
      const { svc, couponCreate } = makeService({ merchantExists: false });
      await expect(
        svc.create({ code: "REDE10", type: "percent", value: 10, merchantId: "nope" }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: "MERCHANT_NOT_FOUND" }) });
      expect(couponCreate).not.toHaveBeenCalled();
    });

    it("código duplicado → CONFLICT (COUPON_CODE_TAKEN)", async () => {
      const { svc } = makeService({ existingByCode: { id: "x" } });
      await expect(
        svc.create({ code: "GLOBAL10", type: "percent", value: 10 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("fixed <= 0 → BadRequest (COUPON_INVALID_VALUE)", async () => {
      const { svc } = makeService({});
      await expect(svc.create({ code: "BAD10", type: "fixed", value: 0 })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "COUPON_INVALID_VALUE" }),
      });
    });
  });

  describe("update", () => {
    it("PATCH parcial altera só o enviado", async () => {
      const { svc, couponUpdate } = makeService({ couponRow: row });
      await svc.update("c1", { active: false });
      expect(couponUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "c1" }, data: { active: false } }),
      );
    });

    it("inexistente → NotFound", async () => {
      const { svc } = makeService({ couponRow: null });
      await expect(svc.update("nope", { active: false })).rejects.toBeInstanceOf(NotFoundException);
    });

    it("nenhum campo → BadRequest (NO_FIELDS)", async () => {
      const { svc } = makeService({ couponRow: row });
      await expect(svc.update("c1", {})).rejects.toMatchObject({
        response: expect.objectContaining({ code: "NO_FIELDS" }),
      });
    });
  });

  describe("remove", () => {
    it("sem uso: deleta", async () => {
      const { svc, couponDelete } = makeService({ couponRow: row });
      await svc.remove("c1");
      expect(couponDelete).toHaveBeenCalledWith({ where: { id: "c1" } });
    });

    it("com uso: bloqueia → BadRequest (COUPON_IN_USE)", async () => {
      const { svc, couponDelete } = makeService({ couponRow: { ...row, usedCount: 2 } });
      await expect(svc.remove("c1")).rejects.toBeInstanceOf(BadRequestException);
      expect(couponDelete).not.toHaveBeenCalled();
    });
  });
});
