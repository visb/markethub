/**
 * Story 41: constantes de config do app driver. Cobre o papel/título fixos e os
 * dois branches da resolução de API_URL (env presente vs. fallback localhost).
 */

// Acesso a process.env via globalThis (o app não depende de @types/node — mesmo
// padrão usado por src/config.ts).
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env;

describe("config (driver)", () => {
  const original = env.EXPO_PUBLIC_API_URL;

  afterEach(() => {
    if (original === undefined) delete env.EXPO_PUBLIC_API_URL;
    else env.EXPO_PUBLIC_API_URL = original;
    jest.resetModules();
  });

  it("fixa o papel e o título do app", () => {
    jest.isolateModules(() => {
      const config = require("../config");
      expect(config.APP_ROLE).toBe("driver");
      expect(config.APP_TITLE).toBe("MarketHub Entregador");
    });
  });

  it("usa o fallback localhost quando EXPO_PUBLIC_API_URL não está definido", () => {
    delete env.EXPO_PUBLIC_API_URL;
    jest.isolateModules(() => {
      const config = require("../config");
      expect(config.API_URL).toBe("http://localhost:3000");
    });
  });

  it("usa EXPO_PUBLIC_API_URL quando definido", () => {
    env.EXPO_PUBLIC_API_URL = "http://10.0.0.2:3000";
    jest.isolateModules(() => {
      const config = require("../config");
      expect(config.API_URL).toBe("http://10.0.0.2:3000");
    });
  });
});
