import type {
  ApiError,
  AuthTokens,
  AuthUser,
  DeliveryDTO,
  LoginInput,
  MerchantContextDTO,
  MerchantStoreDetailDTO,
  MerchantStoreInput,
  MerchantStoreUpdateInput,
  PickTaskDTO,
  RefreshInput,
  RegisterInput,
  StoreDriverDTO,
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
  /** Contexto de identidade do app merchant: papel efetivo + lojas (story 07). */
  merchantContext(): Promise<MerchantContextDTO> {
    return this.request("/merchant/context", { auth: true });
  }

  merchantStores(): Promise<PickStore[]> {
    return this.request("/merchant/stores", { auth: true });
  }

  /** Lista detalhada das lojas visíveis (endereço/coords/active) — story 08. */
  merchantStoresDetail(): Promise<MerchantStoreDetailDTO[]> {
    return this.request("/merchant/stores/detail", { auth: true });
  }

  /** Cria uma loja na rede do dono (owner-only — story 08). */
  merchantCreateStore(input: MerchantStoreInput): Promise<MerchantStoreDetailDTO> {
    return this.request("/merchant/stores", { method: "POST", body: input, auth: true });
  }

  /** Edita uma loja da rede do dono (owner-only — story 08). */
  merchantUpdateStore(id: string, patch: MerchantStoreUpdateInput): Promise<MerchantStoreDetailDTO> {
    return this.request(`/merchant/stores/${id}`, { method: "PATCH", body: patch, auth: true });
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

  // ─── Entregador / driver (entrega própria) ───────────
  /** Lojas às quais o entregador está vinculado (StoreStaff role driver). */
  driverMyStores(): Promise<PickStore[]> {
    return this.request("/driver/stores", { auth: true });
  }

  /** Entregas atribuídas ao entregador (default: em aberto). */
  driverDeliveries(params: { storeId?: string; status?: string } = {}): Promise<DeliveryDTO[]> {
    const q = new URLSearchParams();
    if (params.storeId) q.set("storeId", params.storeId);
    if (params.status) q.set("status", params.status);
    const qs = q.toString();
    return this.request(`/driver/deliveries${qs ? `?${qs}` : ""}`, { auth: true });
  }

  /** Pool: entregas prontas e sem entregador nas lojas do entregador. */
  driverAvailableDeliveries(params: { storeId?: string } = {}): Promise<DeliveryDTO[]> {
    const q = new URLSearchParams();
    if (params.storeId) q.set("storeId", params.storeId);
    const qs = q.toString();
    return this.request(`/driver/deliveries/available${qs ? `?${qs}` : ""}`, { auth: true });
  }

  /** Aceita uma entrega do pool (auto-atribuição). */
  driverAcceptDelivery(id: string): Promise<DeliveryDTO> {
    return this.request(`/driver/deliveries/${id}/accept`, { method: "POST", auth: true });
  }

  /** Coleta na loja: valida o pickupCode → entrega segue a caminho. */
  driverConfirmPickup(id: string, pickupCode: string): Promise<DeliveryDTO> {
    return this.request(`/driver/deliveries/${id}/pickup`, { method: "POST", body: { pickupCode }, auth: true });
  }

  /** Entrega ao cliente: valida o deliveryCode → entregue. */
  driverConfirmDelivery(id: string, deliveryCode: string): Promise<DeliveryDTO> {
    return this.request(`/driver/deliveries/${id}/deliver`, { method: "POST", body: { deliveryCode }, auth: true });
  }

  // ─── Loja: despacho de entregas (manager/picker) ─────
  storeDeliveries(storeId: string, status?: string): Promise<DeliveryDTO[]> {
    const q = new URLSearchParams({ storeId });
    if (status) q.set("status", status);
    return this.request(`/store/deliveries?${q.toString()}`, { auth: true });
  }

  storeDrivers(storeId: string): Promise<StoreDriverDTO[]> {
    return this.request(`/store/drivers?storeId=${encodeURIComponent(storeId)}`, { auth: true });
  }

  assignDelivery(id: string, driverId: string): Promise<DeliveryDTO> {
    return this.request(`/store/deliveries/${id}/assign`, { method: "POST", body: { driverId }, auth: true });
  }

  unassignDelivery(id: string): Promise<DeliveryDTO> {
    return this.request(`/store/deliveries/${id}/unassign`, { method: "POST", auth: true });
  }

  /** Retirada na loja: cliente apresenta o código; a loja confirma a entrega. */
  storeHandover(orderGroupId: string, code: string): Promise<unknown> {
    return this.request(`/store/order-groups/${orderGroupId}/handover`, {
      method: "POST",
      body: { code },
      auth: true,
    });
  }

  // ─── Notificações push (S5.6) ────────────────────────
  /** Registra (upsert) o token de push do device no login do app. */
  registerDeviceToken(token: string, platform: "ios" | "android" | "web"): Promise<{ ok: boolean }> {
    return this.request("/notifications/device-tokens", {
      method: "POST",
      body: { token, platform },
      auth: true,
    });
  }

  /** Remove o token (logout). */
  unregisterDeviceToken(token: string): Promise<{ ok: boolean }> {
    return this.request("/notifications/device-tokens", {
      method: "DELETE",
      body: { token },
      auth: true,
    });
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
