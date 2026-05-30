import type { AuthTokens } from "@markethub/types";

/** Abstração de persistência de tokens. RN usa SecureStore; web usa localStorage. */
export interface TokenStore {
  getAccess(): string | null | Promise<string | null>;
  getRefresh(): string | null | Promise<string | null>;
  setTokens(tokens: AuthTokens): void | Promise<void>;
  clear(): void | Promise<void>;
}

/** Store em memória — útil para testes e SSR. */
export class MemoryTokenStore implements TokenStore {
  private access: string | null = null;
  private refresh: string | null = null;

  getAccess(): string | null {
    return this.access;
  }
  getRefresh(): string | null {
    return this.refresh;
  }
  setTokens(tokens: AuthTokens): void {
    this.access = tokens.accessToken;
    this.refresh = tokens.refreshToken;
  }
  clear(): void {
    this.access = null;
    this.refresh = null;
  }
}
