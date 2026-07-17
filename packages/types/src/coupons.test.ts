import { describe, expect, it } from "vitest";
import {
  adminCreateCouponInputSchema,
  availableCouponSchema,
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
    title: "Dez por cento",
    description: null,
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

  it("title/description aceitam string ou null (story 73)", () => {
    expect(couponSchema.safeParse({ ...base, title: "Bem-vindo", description: "Ganhe 10%" }).success).toBe(
      true,
    );
    // ausente ≠ null: campo faltando reprova.
    const { title: _t, ...semTitle } = base;
    expect(couponSchema.safeParse(semTitle).success).toBe(false);
  });
});

describe("createCouponInputSchema (merchant)", () => {
  it("aceita payload mínimo (code + title + type + value)", () => {
    expect(
      createCouponInputSchema.safeParse({
        code: "FRETEGRATIS",
        title: "Frete grátis",
        type: "free_shipping",
        value: 0,
      }).success,
    ).toBe(true);
  });

  it("aceita opcionais nullable, description e merchantId p/ desambiguar rede", () => {
    expect(
      createCouponInputSchema.safeParse({
        code: "DEZ10",
        title: "Dez reais",
        description: "R$10 de desconto",
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

  it("exige title (story 73): payload sem título ou com título vazio reprova", () => {
    expect(
      createCouponInputSchema.safeParse({ code: "SEMTITULO", type: "fixed", value: 1000 }).success,
    ).toBe(false);
    expect(
      createCouponInputSchema.safeParse({ code: "VAZIO", title: "", type: "fixed", value: 1000 })
        .success,
    ).toBe(false);
  });

  it("rejeita code vazio, value não-inteiro, minOrderCents negativo e maxUses < 1", () => {
    const base = { code: "OK", title: "Cupom OK", type: "fixed", value: 1000 };
    expect(createCouponInputSchema.safeParse({ ...base, code: "" }).success).toBe(false);
    expect(createCouponInputSchema.safeParse({ ...base, value: 10.5 }).success).toBe(false);
    expect(createCouponInputSchema.safeParse({ ...base, minOrderCents: -1 }).success).toBe(false);
    expect(createCouponInputSchema.safeParse({ ...base, maxUses: 0 }).success).toBe(false);
  });

  it("merchantId não aceita null no payload do merchant", () => {
    expect(
      createCouponInputSchema.safeParse({
        code: "OK",
        title: "Cupom OK",
        type: "fixed",
        value: 1,
        merchantId: null,
      }).success,
    ).toBe(false);
  });
});

describe("adminCreateCouponInputSchema (admin)", () => {
  it("merchantId null/ausente = global; id = atrelado a uma rede", () => {
    const base = { code: "GLOBAL5", title: "Global 5%", type: "percent", value: 5 };
    expect(adminCreateCouponInputSchema.safeParse(base).success).toBe(true);
    expect(adminCreateCouponInputSchema.safeParse({ ...base, merchantId: null }).success).toBe(true);
    expect(adminCreateCouponInputSchema.safeParse({ ...base, merchantId: "m1" }).success).toBe(true);
  });

  it("mantém as demais validações do payload base (title obrigatório)", () => {
    expect(
      adminCreateCouponInputSchema.safeParse({ code: "", title: "X", type: "percent", value: 5 })
        .success,
    ).toBe(false);
    expect(
      adminCreateCouponInputSchema.safeParse({ code: "SEMTITULO", type: "percent", value: 5 }).success,
    ).toBe(false);
  });
});

describe("availableCouponSchema (story 74)", () => {
  const base = {
    code: "GLOBAL10",
    title: "Dez off",
    description: "10% de desconto",
    type: "percent" as const,
    value: 10,
    merchantId: null,
    minOrderCents: null,
    discountCents: 200,
    applicable: true,
    reason: null,
  };

  it("cupom aplicável (reason null) passa", () => {
    expect(availableCouponSchema.safeParse(base).success).toBe(true);
  });

  it("title/description null (cupom legado) são aceitos", () => {
    expect(availableCouponSchema.safeParse({ ...base, title: null, description: null }).success).toBe(
      true,
    );
  });

  it("não aplicável com reason MIN_ORDER_NOT_MET + missingCents passa", () => {
    expect(
      availableCouponSchema.safeParse({
        ...base,
        applicable: false,
        reason: { code: "MIN_ORDER_NOT_MET", missingCents: 3000 },
      }).success,
    ).toBe(true);
  });

  it("rejeita reason com code desconhecido", () => {
    expect(
      availableCouponSchema.safeParse({
        ...base,
        applicable: false,
        reason: { code: "OUTRO", missingCents: 1 },
      }).success,
    ).toBe(false);
  });
});
