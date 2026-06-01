import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { AuthTokens, TokenStore } from "@markethub/api-client";

const ACCESS_KEY = "mh_access";
const REFRESH_KEY = "mh_refresh";

/**
 * TokenStore cross-platform: expo-secure-store (Keychain/Keystore) em native,
 * localStorage em web — SecureStore não é suportado em web e lança em runtime.
 */
export class SecureTokenStore implements TokenStore {
  private readonly web = Platform.OS === "web";

  async getAccess(): Promise<string | null> {
    return this.get(ACCESS_KEY);
  }
  async getRefresh(): Promise<string | null> {
    return this.get(REFRESH_KEY);
  }
  async setTokens(tokens: AuthTokens): Promise<void> {
    await this.set(ACCESS_KEY, tokens.accessToken);
    await this.set(REFRESH_KEY, tokens.refreshToken);
  }
  async clear(): Promise<void> {
    await this.remove(ACCESS_KEY);
    await this.remove(REFRESH_KEY);
  }

  private async get(key: string): Promise<string | null> {
    if (this.web) return globalThis.localStorage?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  }
  private async set(key: string, value: string): Promise<void> {
    if (this.web) {
      globalThis.localStorage?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  }
  private async remove(key: string): Promise<void> {
    if (this.web) {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  }
}
