import { beforeEach, describe, expect, it } from "vitest";
import { LocalTokenStore } from "./token-store";

/**
 * C17: camada de dados do admin. O painel ainda não usa React Query/queryKeys
 * (desvio sistêmico documentado em B20/REVIEW-FINDINGS) — a unidade testável de
 * fato é o TokenStore que alimenta o ApiClient compartilhado.
 */
describe("LocalTokenStore", () => {
  beforeEach(() => localStorage.clear());

  it("começa vazio", () => {
    const store = new LocalTokenStore();
    expect(store.getAccess()).toBeNull();
    expect(store.getRefresh()).toBeNull();
  });

  it("setTokens persiste access e refresh", () => {
    const store = new LocalTokenStore();
    store.setTokens({ accessToken: "a1", refreshToken: "r1" });
    expect(store.getAccess()).toBe("a1");
    expect(store.getRefresh()).toBe("r1");
  });

  it("clear remove ambos os tokens", () => {
    const store = new LocalTokenStore();
    store.setTokens({ accessToken: "a1", refreshToken: "r1" });
    store.clear();
    expect(store.getAccess()).toBeNull();
    expect(store.getRefresh()).toBeNull();
  });

  it("instâncias compartilham o mesmo storage (chaves fixas)", () => {
    new LocalTokenStore().setTokens({ accessToken: "a2", refreshToken: "r2" });
    expect(new LocalTokenStore().getAccess()).toBe("a2");
  });
});
