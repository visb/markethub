import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Env } from "../config/env";
import { TokenService, parseDurationMs } from "./token.service";

describe("parseDurationMs", () => {
  it.each([
    ["15m", 15 * 60_000],
    ["30d", 30 * 86_400_000],
    ["12h", 12 * 3_600_000],
    ["45s", 45 * 1_000],
    ["3600", 3_600_000],
  ])("parses %s", (input, expected) => {
    expect(parseDurationMs(input)).toBe(expected);
  });

  it("throws on invalid", () => {
    expect(() => parseDurationMs("abc")).toThrow();
  });
});

describe("TokenService", () => {
  const values: Partial<Env> = {
    JWT_ACCESS_SECRET: "access-secret-0123456789",
    JWT_REFRESH_SECRET: "refresh-secret-0123456789",
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "30d",
  };
  const config = {
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>;
  const svc = new TokenService(new JwtService(), config);

  it("assina e verifica o refresh (roundtrip)", async () => {
    const token = await svc.signRefresh({ sub: "u1", sid: "s1" });
    const payload = await svc.verifyRefresh(token);
    expect(payload.sub).toBe("u1");
    expect(payload.sid).toBe("s1");
  });

  it("rejeita refresh assinado com o segredo de access (segredos distintos)", async () => {
    // access token usa JWT_ACCESS_SECRET; verifyRefresh usa JWT_REFRESH_SECRET
    const accessToken = await svc.signAccess({ sub: "u1", email: "a@b.com", roles: ["customer"] });
    await expect(svc.verifyRefresh(accessToken)).rejects.toBeDefined();
  });

  it("hash + verifyHash fazem roundtrip", async () => {
    const hash = await svc.hash("senha-secreta");
    expect(await svc.verifyHash(hash, "senha-secreta")).toBe(true);
    expect(await svc.verifyHash(hash, "senha-errada")).toBe(false);
  });

  it("refreshExpiry fica ~30d à frente do TTL configurado", () => {
    const exp = svc.refreshExpiry().getTime();
    const expected = Date.now() + 30 * 86_400_000;
    expect(Math.abs(exp - expected)).toBeLessThan(5_000);
  });
});
