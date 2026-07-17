import { BadRequestException } from "@nestjs/common";
import {
  assertValidCouponCode,
  assertValidCouponRules,
  isCouponRedeemable,
  normalizeCouponCode,
} from "./coupon-rules";

/** Captura o `code` de uma BadRequestException lançada por `fn` (ou undefined). */
function errCode(fn: () => void): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e) {
    const res = (e as BadRequestException).getResponse();
    return typeof res === "object" && res !== null ? (res as { code?: string }).code : undefined;
  }
}

/** Regras puras de cupom (story 53): código, faixa por tipo, janela e usos. */
describe("coupon-rules", () => {
  describe("normalizeCouponCode", () => {
    it("faz trim e caixa alta", () => {
      expect(normalizeCouponCode("  black10 ")).toBe("BLACK10");
    });
  });

  describe("assertValidCouponCode", () => {
    it("aceita e normaliza código válido", () => {
      expect(assertValidCouponCode("promo-2026")).toBe("PROMO-2026");
    });

    it("rejeita código curto → COUPON_INVALID_CODE", () => {
      expect(() => assertValidCouponCode("ab")).toThrow(BadRequestException);
      expect(errCode(() => assertValidCouponCode("ab"))).toBe("COUPON_INVALID_CODE");
    });

    it("rejeita caractere inválido (espaço interno)", () => {
      expect(errCode(() => assertValidCouponCode("promo 10"))).toBe("COUPON_INVALID_CODE");
    });
  });

  describe("assertValidCouponRules", () => {
    it("percent válido (1–100) passa", () => {
      expect(() => assertValidCouponRules({ type: "percent", value: 50 })).not.toThrow();
    });

    it("percent fora da faixa → COUPON_INVALID_PERCENT", () => {
      expect(errCode(() => assertValidCouponRules({ type: "percent", value: 0 }))).toBe(
        "COUPON_INVALID_PERCENT",
      );
      expect(errCode(() => assertValidCouponRules({ type: "percent", value: 101 }))).toBe(
        "COUPON_INVALID_PERCENT",
      );
    });

    it("fixed > 0 passa; ≤ 0 → COUPON_INVALID_VALUE", () => {
      expect(() => assertValidCouponRules({ type: "fixed", value: 500 })).not.toThrow();
      expect(errCode(() => assertValidCouponRules({ type: "fixed", value: 0 }))).toBe(
        "COUPON_INVALID_VALUE",
      );
    });

    it("free_shipping ignora o value", () => {
      expect(() => assertValidCouponRules({ type: "free_shipping", value: 0 })).not.toThrow();
    });

    it("janela invertida (from >= to) → COUPON_INVALID_WINDOW", () => {
      expect(
        errCode(() =>
          assertValidCouponRules({
            type: "percent",
            value: 10,
            validFrom: "2026-02-01T00:00:00.000Z",
            validTo: "2026-01-01T00:00:00.000Z",
          }),
        ),
      ).toBe("COUPON_INVALID_WINDOW");
    });

    it("janela coerente (from < to) passa", () => {
      expect(() =>
        assertValidCouponRules({
          type: "percent",
          value: 10,
          validFrom: "2026-01-01T00:00:00.000Z",
          validTo: "2026-02-01T00:00:00.000Z",
        }),
      ).not.toThrow();
    });

    it("maxUses menor que usedCount → COUPON_MAX_USES_BELOW_USED", () => {
      expect(errCode(() => assertValidCouponRules({ type: "percent", value: 10, maxUses: 3 }, 5))).toBe(
        "COUPON_MAX_USES_BELOW_USED",
      );
    });

    it("maxUses inválido (0) → COUPON_INVALID_MAX_USES", () => {
      expect(errCode(() => assertValidCouponRules({ type: "percent", value: 10, maxUses: 0 }))).toBe(
        "COUPON_INVALID_MAX_USES",
      );
    });

    it("maxUses >= usedCount passa", () => {
      expect(() =>
        assertValidCouponRules({ type: "percent", value: 10, maxUses: 10 }, 5),
      ).not.toThrow();
    });
  });

  describe("isCouponRedeemable (story 74)", () => {
    const NOW = new Date("2026-07-17T12:00:00Z");
    const base = {
      active: true,
      validFrom: null as Date | null,
      validTo: null as Date | null,
      maxUses: null as number | null,
      usedCount: 0,
    };

    it("cupom ativo, vigente e com usos → resgatável", () => {
      expect(isCouponRedeemable(base, NOW)).toBe(true);
    });

    it("inativo → não resgatável", () => {
      expect(isCouponRedeemable({ ...base, active: false }, NOW)).toBe(false);
    });

    it("antes do validFrom → não resgatável", () => {
      expect(isCouponRedeemable({ ...base, validFrom: new Date("2999-01-01") }, NOW)).toBe(false);
    });

    it("após o validTo → não resgatável", () => {
      expect(isCouponRedeemable({ ...base, validTo: new Date("2000-01-01") }, NOW)).toBe(false);
    });

    it("dentro da janela (from < now < to) → resgatável", () => {
      expect(
        isCouponRedeemable(
          { ...base, validFrom: new Date("2026-01-01"), validTo: new Date("2027-01-01") },
          NOW,
        ),
      ).toBe(true);
    });

    it("usedCount >= maxUses → esgotado", () => {
      expect(isCouponRedeemable({ ...base, maxUses: 5, usedCount: 5 }, NOW)).toBe(false);
      expect(isCouponRedeemable({ ...base, maxUses: 5, usedCount: 4 }, NOW)).toBe(true);
    });

    it("aceita datas em string e usedCount ausente", () => {
      expect(
        isCouponRedeemable(
          { active: true, validFrom: "2026-01-01T00:00:00Z", validTo: "2027-01-01T00:00:00Z", maxUses: 3 },
          NOW,
        ),
      ).toBe(true);
    });

    it("usa `new Date()` como padrão quando `now` é omitido", () => {
      expect(isCouponRedeemable(base)).toBe(true);
    });
  });
});
