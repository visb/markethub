import * as SecureStore from "expo-secure-store";
import type { AuthTokens, TokenStore } from "@markethub/api-client";

const ACCESS_KEY = "mh_access";
const REFRESH_KEY = "mh_refresh";

/** TokenStore baseado em expo-secure-store (Keychain/Keystore). */
export class SecureTokenStore implements TokenStore {
  async getAccess(): Promise<string | null> {
    return SecureStore.getItemAsync(ACCESS_KEY);
  }
  async getRefresh(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_KEY);
  }
  async setTokens(tokens: AuthTokens): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken);
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
  }
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  }
}
