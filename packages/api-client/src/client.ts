import type {
  ApiError,
  AuthTokens,
  AuthUser,
  LoginInput,
  RefreshInput,
  RegisterInput,
} from "@markethub/types";
import { MemoryTokenStore, type TokenStore } from "./token-store";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(body.message);
    this.name = "ApiClientError";
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Prefixo da API. Default "api/v1". */
  prefix?: string;
  tokenStore?: TokenStore;
  /** Chamado quando o refresh falha (sessão expirada) — app deve deslogar. */
  onAuthError?: () => void;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  /** Interno: evita loop de refresh. */
  _retry?: boolean;
}

export class ApiClient {
  private readonly base: string;
  readonly tokenStore: TokenStore;
  private readonly onAuthError?: () => void;
  private refreshing: Promise<boolean> | null = null;

  constructor(opts: ApiClientOptions) {
    const prefix = (opts.prefix ?? "api/v1").replace(/^\/|\/$/g, "");
    this.base = `${opts.baseUrl.replace(/\/$/, "")}/${prefix}`;
    this.tokenStore = opts.tokenStore ?? new MemoryTokenStore();
    this.onAuthError = opts.onAuthError;
  }

  // ─── Auth ────────────────────────────────────────────
  async register(input: RegisterInput): Promise<AuthTokens> {
    const tokens = await this.request<AuthTokens>("/auth/register", {
      method: "POST",
      body: input,
      auth: false,
    });
    await this.tokenStore.setTokens(tokens);
    return tokens;
  }

  async login(input: LoginInput): Promise<AuthTokens> {
    const tokens = await this.request<AuthTokens>("/auth/login", {
      method: "POST",
      body: input,
      auth: false,
    });
    await this.tokenStore.setTokens(tokens);
    return tokens;
  }

  async logout(): Promise<void> {
    const refreshToken = await this.tokenStore.getRefresh();
    if (refreshToken) {
      const payload: RefreshInput = { refreshToken };
      await this.request<void>("/auth/logout", { method: "POST", body: payload, auth: false }).catch(
        () => undefined,
      );
    }
    await this.tokenStore.clear();
  }

  me(): Promise<AuthUser> {
    return this.request<AuthUser>("/auth/me", { auth: true });
  }

  health(): Promise<{ status: string; checks: Record<string, string> }> {
    return this.request("/health", { auth: false });
  }

  // ─── Core request com refresh automático ─────────────
  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.auth) {
      const access = await this.tokenStore.getAccess();
      if (access) headers.Authorization = `Bearer ${access}`;
    }

    const res = await fetch(`${this.base}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (res.status === 401 && opts.auth && !opts._retry) {
      const ok = await this.tryRefresh();
      if (ok) return this.request<T>(path, { ...opts, _retry: true });
      this.onAuthError?.();
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({
        code: "UNKNOWN",
        message: res.statusText,
      }))) as ApiError;
      throw new ApiClientError(res.status, body);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /** Refresh com deduplicação de chamadas concorrentes. */
  private tryRefresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const refreshToken = await this.tokenStore.getRefresh();
        if (!refreshToken) return false;
        const res = await fetch(`${this.base}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          await this.tokenStore.clear();
          return false;
        }
        const tokens = (await res.json()) as AuthTokens;
        await this.tokenStore.setTokens(tokens);
        return true;
      } catch {
        return false;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }
}
