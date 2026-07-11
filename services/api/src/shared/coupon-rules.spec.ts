import { BadRequestException } from "@nestjs/common";
import {
  assertValidCouponCode,
  assertValidCouponRules,
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
});
