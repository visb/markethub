import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ApiClient,
  ApiClientError,
  createRealtimeClient,
  type AuthUser,
  type RealtimeClient,
} from "@markethub/api-client";
import { API_URL, APP_ROLE } from "./config";
import { SecureTokenStore } from "./token-store";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  api: ApiClient;
  /** Cliente Socket.IO compartilhado (mesma origem/token da API). */
  realtime: RealtimeClient;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Mesmo token store da API → o socket usa o mesmo JWT no handshake.
  const tokenStore = useMemo(() => new SecureTokenStore(), []);

  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl: API_URL,
        tokenStore,
        onAuthError: () => setUser(null),
      }),
    [tokenStore],
  );

  const realtime = useMemo(
    () => createRealtimeClient({ url: API_URL, getToken: () => tokenStore.getAccess() }),
    [tokenStore],
  );

  const loadSession = useCallback(async () => {
    try {
      const me = await client.me();
      if (me.roles.includes(APP_ROLE)) setUser(me);
      else await client.logout();
    } catch {
      // sem sessão válida
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      await client.login({ email, password });
      const me = await client.me();
      if (!me.roles.includes(APP_ROLE)) {
        await client.logout();
        throw new ApiClientError(403, {
          code: "WRONG_APP_ROLE",
          message: `Esta conta não tem acesso de ${APP_ROLE}.`,
        });
      }
      setUser(me);
    },
    [client],
  );

  const logout = useCallback(async () => {
    await client.logout();
    setUser(null);
  }, [client]);

  const value = useMemo(
    () => ({ user, loading, api: client, realtime, login, logout }),
    [user, loading, client, realtime, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
