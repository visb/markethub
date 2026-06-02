import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiClient, ApiClientError, type AuthUser } from "@markethub/api-client";
import { API_URL, APP_ROLE } from "./config";
import { SecureTokenStore } from "./token-store";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  client: ApiClient;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl: API_URL,
        tokenStore: new SecureTokenStore(),
        onAuthError: () => setUser(null),
      }),
    [],
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
    () => ({ user, loading, client, login, logout }),
    [user, loading, client, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
