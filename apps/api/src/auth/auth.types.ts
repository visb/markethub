import type { RoleName } from "@prisma/client";

export interface JwtAccessPayload {
  sub: string;
  email: string;
  roles: RoleName[];
}

export interface JwtRefreshPayload {
  sub: string;
  sid: string;
}

/** Usuário autenticado anexado em request.user pela JwtStrategy. */
export interface AuthUser {
  id: string;
  email: string;
  roles: RoleName[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
