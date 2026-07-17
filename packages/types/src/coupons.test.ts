import { describe, expect, it } from "vitest";
import {
  adminCreateCouponInputSchema,
  couponSchema,
  couponTypeSchema,
  createCouponInputSchema,
} from "./coupons";

/**
 * Contratos zod de cupons (story 53). Mesmos schemas usados pelos apps
 * admin/merchant — espelham os DTOs da API (backend não importa este pacote).
 */
describe("couponTypeSchema", () => {
  it("aceita fixed|percent|free_shipping e rejeita desconhecido", () => {
    for (const t of ["fixed", "percent", "free_shipping"]) {
      expect(couponTypeSchema.safeParse(t).success).toBe(true);
    }
    expect(couponTypeSchema.safeParse("bogo").success).toBe(false);
  });
});

describe("couponSchema", () => {
  const base = {
    id: "c1",
    code: "DEZ10",
    type: "percent",
    value: 10,
    merchantId: null,
    merchantName: null,
    minOrderCents: null,
    validFrom: null,
    validTo: null,
    maxUses: null,
    usedCount: 0,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("aceita cupom global (merchantId null) e cupom de rede", () => {
    expect(couponSchema.safeParse(base).success).toBe(true);
    expect(
      couponSchema.safeParse({ ...base, merchantId: "m1", merchantName: "Rede X" }).success,
    ).toBe(true);
  });

  it("exige campos nullable presentes (ausente ≠ null) e tipo válido", () => {
    const { merchantId: _omitted, ...semMerchantId } = base;
    expect(couponSchema.safeParse(semMerchantId).success).toBe(false);
    expect(couponSchema.safeParse({ ...base, type: "bogo" }).success).toBe(false);
  });
});

describe("createCouponInputSchema (merchant)", () => {
  it("aceita payload mínimo (code + type + value)", () => {
    expect(
      createCouponInputSchema.safeParse({ code: "FRETEGRATIS", type: "free_shipping", value: 0 })
        .success,
    ).toBe(true);
  });

  it("aceita opcionais nullable e merchantId p/ desambiguar rede", () => {
    expect(
      createCouponInputSchema.safeParse({
        code: "DEZ10",
        type: "fixed",
        value: 1000,
        minOrderCents: 5000,
        validFrom: null,
        validTo: "2026-12-31T23:59:59.000Z",
        maxUses: 100,
        active: true,
        merchantId: "m1",
      }).success,
    ).toBe(true);
  });

  it("rejeita code vazio, value não-inteiro, minOrderCents negativo e maxUses < 1", () => {
    const base = { code: "OK", type: "fixed", value: 1000 };
    expect(createCouponInputSchema.safeParse({ ...base, code: "" }).success).toBe(false);
    expect(createCouponInputSchema.safeParse({ ...base, value: 10.5 }).success).toBe(false);
    expect(createCouponInputSchema.safeParse({ ...base, minOrderCents: -1 }).success).toBe(false);
    expect(createCouponInputSchema.safeParse({ ...base, maxUses: 0 }).success).toBe(false);
  });

  it("merchantId não aceita null no payload do merchant", () => {
    expect(
      createCouponInputSchema.safeParse({ code: "OK", type: "fixed", value: 1, merchantId: null })
        .success,
    ).toBe(false);
  });
});

describe("adminCreateCouponInputSchema (admin)", () => {
  it("merchantId null/ausente = global; id = atrelado a uma rede", () => {
    const base = { code: "GLOBAL5", type: "percent", value: 5 };
    expect(adminCreateCouponInputSchema.safeParse(base).success).toBe(true);
    expect(adminCreateCouponInputSchema.safeParse({ ...base, merchantId: null }).success).toBe(true);
    expect(adminCreateCouponInputSchema.safeParse({ ...base, merchantId: "m1" }).success).toBe(true);
  });

  it("mantém as demais validações do payload base", () => {
    expect(
      adminCreateCouponInputSchema.safeParse({ code: "", type: "percent", value: 5 }).success,
    ).toBe(false);
  });
});
