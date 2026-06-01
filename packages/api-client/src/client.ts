import type {
  ApiError,
  AuthTokens,
  AuthUser,
  LoginInput,
  PickTaskDTO,
  RefreshInput,
  RegisterInput,
} from "@markethub/types";
import { MemoryTokenStore, type TokenStore } from "./token-store";

export interface PickStore {
  id: string;
  name: string;
  merchantId: string;
}

export interface PickItemActionInput {
  action: "pick" | "refuse";
  quantityPicked?: number;
  weightGramsPicked?: number;
  refusalReason?: string;
}

export interface MerchantOffer {
  id: string;
  storeId: string;
  storeName: string;
  product: { id: string; name: string; brand: string | null; imageUrl: string | null; saleType: "unit" | "weight"; categoryId: string | null };
  priceCents: number;
  promoPriceCents: number | null;
  available: boolean;
  lockedFields: string[];
  stock: { quantity: number | null; available: boolean; lockedFields: string[] } | null;
}

export interface MerchantStock {
  id: string;
  storeId: string;
  storeName: string;
  product: { id: string; name: string; brand: string | null; saleType: "unit" | "weight" };
  quantity: number | null;
  available: boolean;
  lockedFields: string[];
}

export interface PresignedUpload {
  uploadUrl: string;
  publicUrl: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
}

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

  // ─── Picking / separador (S3.7) ──────────────────────
  pickStores(): Promise<PickStore[]> {
    return this.request("/pick-tasks/stores", { auth: true });
  }

  pickQueue(storeId: string): Promise<PickTaskDTO[]> {
    return this.request(`/pick-tasks?storeId=${encodeURIComponent(storeId)}`, { auth: true });
  }

  pickTask(id: string): Promise<PickTaskDTO> {
    return this.request(`/pick-tasks/${id}`, { auth: true });
  }

  pickAssign(id: string): Promise<PickTaskDTO> {
    return this.request(`/pick-tasks/${id}/assign`, { method: "POST", auth: true });
  }

  pickRelease(id: string): Promise<PickTaskDTO> {
    return this.request(`/pick-tasks/${id}/release`, { method: "POST", auth: true });
  }

  pickStart(id: string): Promise<PickTaskDTO> {
    return this.request(`/pick-tasks/${id}/start`, { method: "POST", auth: true });
  }

  pickUpdateItem(id: string, itemId: string, input: PickItemActionInput): Promise<unknown> {
    return this.request(`/pick-tasks/${id}/items/${itemId}`, { method: "PATCH", body: input, auth: true });
  }

  pickSubstitute(id: string, itemId: string, substituteOfferId: string): Promise<unknown> {
    return this.request(`/pick-tasks/${id}/items/${itemId}/substitute`, {
      method: "POST",
      body: { substituteOfferId },
      auth: true,
    });
  }

  pickCompletePicking(id: string): Promise<PickTaskDTO> {
    return this.request(`/pick-tasks/${id}/complete-picking`, { method: "POST", auth: true });
  }

  pickReady(id: string): Promise<PickTaskDTO> {
    return this.request(`/pick-tasks/${id}/ready`, { method: "POST", auth: true });
  }

  /** Loja/picker libera a coleta digitando o pickupCode apresentado pelo entregador (SF.1). */
  pickReleasePickup(id: string, pickupCode: string): Promise<PickTaskDTO> {
    return this.request(`/pick-tasks/${id}/release-pickup`, {
      method: "POST",
      body: { pickupCode },
      auth: true,
    });
  }

  // ─── Merchant / gestão de catálogo (S3.11) ───────────
  merchantStores(): Promise<PickStore[]> {
    return this.request("/merchant/stores", { auth: true });
  }

  merchantOffers(params: { storeId?: string; search?: string; categoryId?: string; available?: boolean } = {}): Promise<MerchantOffer[]> {
    const q = new URLSearchParams();
    if (params.storeId) q.set("storeId", params.storeId);
    if (params.search) q.set("search", params.search);
    if (params.categoryId) q.set("categoryId", params.categoryId);
    if (params.available !== undefined) q.set("available", String(params.available));
    const qs = q.toString();
    return this.request(`/merchant/offers${qs ? `?${qs}` : ""}`, { auth: true });
  }

  merchantUpdateOffer(id: string, patch: { priceCents?: number; promoPriceCents?: number | null; available?: boolean }): Promise<unknown> {
    return this.request(`/merchant/offers/${id}`, { method: "PATCH", body: patch, auth: true });
  }

  merchantUnlockOffer(id: string, field: string): Promise<unknown> {
    return this.request(`/merchant/offers/${id}/locks/${field}`, { method: "DELETE", auth: true });
  }

  merchantStocks(storeId?: string): Promise<MerchantStock[]> {
    return this.request(`/merchant/stocks${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ""}`, { auth: true });
  }

  merchantUpdateStock(id: string, patch: { quantity?: number | null; available?: boolean }): Promise<unknown> {
    return this.request(`/merchant/stocks/${id}`, { method: "PATCH", body: patch, auth: true });
  }

  merchantUnlockStock(id: string, field: string): Promise<unknown> {
    return this.request(`/merchant/stocks/${id}/locks/${field}`, { method: "DELETE", auth: true });
  }

  merchantUploadUrl(filename: string, contentType: string): Promise<PresignedUpload> {
    return this.request("/merchant/products/upload-url", {
      method: "POST",
      body: { filename, contentType },
      auth: true,
    });
  }

  merchantCreateProduct(input: Record<string, unknown>): Promise<unknown> {
    return this.request("/merchant/products", { method: "POST", body: input, auth: true });
  }

  merchantUpdateProduct(id: string, input: Record<string, unknown>): Promise<unknown> {
    return this.request(`/merchant/products/${id}`, { method: "PATCH", body: input, auth: true });
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
