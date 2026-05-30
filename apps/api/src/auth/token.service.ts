import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import type { Env } from "../config/env";
import type { JwtAccessPayload, JwtRefreshPayload } from "./auth.types";

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async signAccess(payload: JwtAccessPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
      expiresIn: this.config.get("JWT_ACCESS_TTL", { infer: true }),
    });
  }

  async signRefresh(payload: JwtRefreshPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.get("JWT_REFRESH_SECRET", { infer: true }),
      expiresIn: this.config.get("JWT_REFRESH_TTL", { infer: true }),
    });
  }

  async verifyRefresh(token: string): Promise<JwtRefreshPayload> {
    return this.jwt.verifyAsync<JwtRefreshPayload>(token, {
      secret: this.config.get("JWT_REFRESH_SECRET", { infer: true }),
    });
  }

  hash(value: string): Promise<string> {
    return argon2.hash(value);
  }

  verifyHash(hash: string, value: string): Promise<boolean> {
    return argon2.verify(hash, value);
  }

  /** Expiração absoluta do refresh para gravar em Session.expiresAt. */
  refreshExpiry(): Date {
    const ttl = this.config.get("JWT_REFRESH_TTL", { infer: true });
    return new Date(Date.now() + parseDurationMs(ttl));
  }
}

/** Converte "15m", "30d", "12h", "3600s" em ms. */
export function parseDurationMs(ttl: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(ttl.trim());
  if (!match) {
    const asNumber = Number(ttl);
    if (!Number.isNaN(asNumber)) return asNumber * 1000;
    throw new Error(`Invalid duration: ${ttl}`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  const factor = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return value * factor;
}
