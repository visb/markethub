import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { AuthTokens, TokenStore } from "@markethub/api-client";

const ACCESS_KEY = "mh_access";
const REFRESH_KEY = "mh_refresh";

const isWeb = Platform.OS === "web";

/**
 * TokenStore: usa expo-secure-store no nativo (Keychain/Keystore) e localStorage na web
 * (SecureStore não existe no browser). Facilita testes em dev no navegador.
 */
export class SecureTokenStore implements TokenStore {
  async getAccess(): Promise<string | null> {
    return isWeb ? webGet(ACCESS_KEY) : SecureStore.getItemAsync(ACCESS_KEY);
  }
  async getRefresh(): Promise<string | null> {
    return isWeb ? webGet(REFRESH_KEY) : SecureStore.getItemAsync(REFRESH_KEY);
  }
  async setTokens(tokens: AuthTokens): Promise<void> {
    if (isWeb) {
      webSet(ACCESS_KEY, tokens.accessToken);
      webSet(REFRESH_KEY, tokens.refreshToken);
      return;
    }
    await SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken);
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
  }
  async clear(): Promise<void> {
    if (isWeb) {
      webDel(ACCESS_KEY);
      webDel(REFRESH_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  }
}

function webGet(key: string): string | null {
  return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
}
function webSet(key: string, value: string): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
}
function webDel(key: string): void {
  if (typeof localStorage !== "undefined") localStorage.removeItem(key);
}
