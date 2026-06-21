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

/**
 * Acesso ao app merchant: owner (RoleName `merchant`) OU manager (StoreStaff
 * manager). Como managers podem não ter RoleName `merchant`, o gate definitivo é
 * o `GET /merchant/context` (200 = tem acesso; 403 = não). Owner com RoleName
 * passa o atalho local; demais validam contra o backend.
 */
async function assertPanelAccess(client: ApiClient, user: AuthUser): Promise<void> {
  if (user.roles.includes("admin") || user.roles.includes("merchant")) return;
  // manager sem RoleName merchant → confirmar vínculo no backend
  await client.merchantContext();
}

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
        await assertPanelAccess(client, me);
        if (active) setUser(me);
      } catch {
        if (active) await client.logout().catch(() => undefined);
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
      try {
        await assertPanelAccess(client, me);
      } catch {
        await client.logout();
        throw new ApiClientError(403, {
          code: "NO_PANEL_ACCESS",
          message: "Esta conta não tem acesso ao painel do mercado.",
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
