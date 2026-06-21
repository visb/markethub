import type { AuthTokens, TokenStore } from "@markethub/api-client";

const ACCESS_KEY = "mh_merchant_access";
const REFRESH_KEY = "mh_merchant_refresh";

/** TokenStore para web (localStorage). Chaves próprias do app merchant. */
export class LocalTokenStore implements TokenStore {
  getAccess(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  }
  getRefresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  }
  setTokens(tokens: AuthTokens): void {
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  }
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }
}
