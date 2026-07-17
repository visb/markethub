import type { RoleName } from "@prisma/client";

export interface JwtAccessPayload {
  sub: string;
  email: string;
  roles: RoleName[];
  /**
   * Sessão que emitiu o access token (story 70) — permite à troca de senha
   * revogar as demais sessões preservando a corrente. Opcional: tokens emitidos
   * antes da story não o carregam.
   */
  sid?: string;
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
  /** Sessão corrente (claim `sid` do access token) — ver JwtAccessPayload. */
  sessionId?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
