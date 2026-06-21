import { createHmac } from "node:crypto";
import {
  API_KEY_PREFIX,
  apiKeyMatches,
  apiKeyPrefix,
  generateApiKey,
  generateWebhookSecret,
  hashApiKey,
  maskSecret,
  signWebhookBody,
} from "./integration.crypto";

/**
 * Cripto da integração (story 09): geração RNG, hash de api-key e assinatura HMAC
 * do webhook conferidos com vetor conhecido.
 */
describe("integration.crypto", () => {
  describe("api-key", () => {
    it("gera chave com prefixo e hash verificável; chaves distintas a cada chamada", () => {
      const a = generateApiKey();
      const b = generateApiKey();
      expect(a.startsWith(API_KEY_PREFIX)).toBe(true);
      expect(a).not.toBe(b); // RNG
      expect(apiKeyPrefix(a)).toBe(a.slice(0, API_KEY_PREFIX.length + 6));
    });

    it("hash bate com a chave; chave errada não bate (tempo constante)", () => {
      const key = generateApiKey();
      const stored = hashApiKey(key);
      expect(apiKeyMatches(key, stored)).toBe(true);
      expect(apiKeyMatches(key + "x", stored)).toBe(false);
      expect(apiKeyMatches("mk_live_outra", stored)).toBe(false);
    });
  });

  describe("webhook signature", () => {
    it("assina o corpo com HMAC-SHA256 (vetor conhecido)", () => {
      const secret = "whsec_test";
      const body = JSON.stringify({ event: "order.created", data: { orderId: "o1" } });
      const expected =
        "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
      expect(signWebhookBody(secret, body)).toBe(expected);
    });

    it("muda a assinatura se o corpo muda (integridade)", () => {
      const secret = "whsec_test";
      const a = signWebhookBody(secret, "{}");
      const b = signWebhookBody(secret, '{"x":1}');
      expect(a).not.toBe(b);
    });

    it("gera secret com prefixo whsec_", () => {
      expect(generateWebhookSecret().startsWith("whsec_")).toBe(true);
    });
  });

  describe("maskSecret", () => {
    it("mostra só os últimos 4 chars", () => {
      expect(maskSecret("whsec_abcd1234")).toBe("****1234");
      expect(maskSecret("ab")).toBe("****");
    });
  });
});
