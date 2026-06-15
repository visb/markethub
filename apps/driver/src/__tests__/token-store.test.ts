jest.mock("expo-secure-store", () => {
  const m = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => (m.has(k) ? m.get(k)! : null)),
    setItemAsync: jest.fn(async (k: string, v: string) => void m.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void m.delete(k)),
    __map: m,
  };
});

import * as SecureStore from "expo-secure-store";
import { SecureTokenStore } from "../token-store";

const map = (SecureStore as unknown as { __map: Map<string, string> }).__map;

/**
 * C24: SecureTokenStore do driver — persistência de tokens via expo-secure-store.
 * O fluxo de entrega (pickup/deliver) está inline na rota app/delivery/[id].tsx
 * (desvio B23) e os helpers de formatação já têm format.test.ts; aqui cobrimos
 * a unidade de dados isolável.
 */
describe("SecureTokenStore (driver)", () => {
  beforeEach(() => map.clear());

  it("começa vazio", async () => {
    const s = new SecureTokenStore();
    expect(await s.getAccess()).toBeNull();
    expect(await s.getRefresh()).toBeNull();
  });

  it("setTokens grava e getAccess/getRefresh leem", async () => {
    const s = new SecureTokenStore();
    await s.setTokens({ accessToken: "a1", refreshToken: "r1" });
    expect(await s.getAccess()).toBe("a1");
    expect(await s.getRefresh()).toBe("r1");
  });

  it("clear remove os dois tokens", async () => {
    const s = new SecureTokenStore();
    await s.setTokens({ accessToken: "a1", refreshToken: "r1" });
    await s.clear();
    expect(await s.getAccess()).toBeNull();
    expect(await s.getRefresh()).toBeNull();
  });
});
