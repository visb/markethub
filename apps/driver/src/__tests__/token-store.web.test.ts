import { Platform } from "react-native";

/**
 * Story 41: branch web do SecureTokenStore. Em web, SecureStore não é suportado e
 * o store cai para localStorage. Força Platform.OS = "web" antes de construir e
 * injeta um localStorage fake para exercitar get/set/remove desse caminho.
 */
describe("SecureTokenStore — branch web (localStorage)", () => {
  const realOS = Platform.OS;
  const store = new Map<string, string>();

  beforeAll(() => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });

  afterAll(() => {
    Object.defineProperty(Platform, "OS", { value: realOS, configurable: true });
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  beforeEach(() => store.clear());

  it("grava, lê e limpa via localStorage", async () => {
    // import isolado para que `this.web` seja avaliado com Platform.OS = "web".
    const { SecureTokenStore } = require("../token-store");
    const s = new SecureTokenStore();
    expect(await s.getAccess()).toBeNull();
    expect(await s.getRefresh()).toBeNull();

    await s.setTokens({ accessToken: "a1", refreshToken: "r1" });
    expect(await s.getAccess()).toBe("a1");
    expect(await s.getRefresh()).toBe("r1");

    await s.clear();
    expect(await s.getAccess()).toBeNull();
    expect(await s.getRefresh()).toBeNull();
  });
});
