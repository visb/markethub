import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiClient, ApiClientError, type AuthUser } from "@markethub/api-client";
import { API_URL } from "@/config";
import { LocalTokenStore } from "./token-store";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  api: ApiClient;
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
        tokenStore: new LocalTokenStore(),
        onAuthError: () => setUser(null),
      }),
    [],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const me = await client.me();
        if (active && me.roles.includes("admin")) setUser(me);
        else if (active) await client.logout();
      } catch {
        // sem sessão
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const login = useCallback(
    async (email: string, password: string) => {
      await client.login({ email, password });
      const me = await client.me();
      if (!me.roles.includes("admin")) {
        await client.logout();
        throw new ApiClientError(403, {
          code: "NOT_ADMIN",
          message: "Esta conta não tem acesso de administrador.",
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
    () => ({ user, loading, api: client, login, logout }),
    [user, loading, client, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
