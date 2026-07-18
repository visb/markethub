import type { ApiClient } from "@markethub/api-client";
import type {
  NearbyStoreDTO,
  ReverseGeocodeResult,
  StoreReviewDTO,
  StoreReviewsPageDTO,
  StoreSummaryDTO,
  ViewportBoundsDTO,
} from "@markethub/types";

// Re-export dos contratos compartilhados do mapa (stories 04/05/06/29) — fonte única em packages/types.
export type { NearbyStoreDTO, StoreSummaryDTO, ViewportBoundsDTO } from "@markethub/types";
// Geocodificação reversa via backend (story 76).
export type { ReverseGeocodeResult } from "@markethub/types";
// Vitrine pública de avaliações da rede (story 56).
export type { StoreReviewDTO, StoreReviewsPageDTO } from "@markethub/types";

export type SaleType = "unit" | "weight";

export interface Merchant {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}
export interface Store {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}
export interface ProductView {
  offerId: string;
  id: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  packageSize: string | null;
  saleType: SaleType;
  priceCents: number;
  promoPriceCents: number | null;
}
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CartItemView {
  id: string;
  offerId: string;
  name: string;
  imageUrl: string | null;
  saleType: SaleType;
  packageSize: string | null;
  unitPriceCents: number;
  quantity: number;
  weightGrams: number | null;
  available: boolean;
}
export interface CartGroupTotals {
  merchantId: string;
  subtotalCents: number;
  deliveryCents: number;
  prepCents: number;
  platformFeeCents: number;
}
export interface CartTotals {
  itemsCents: number;
  deliveryCents: number;
  prepCents: number;
  platformFeeCents: number;
  discountCents: number;
  doorSurchargeCents: number;
  totalCents: number;
  groups: CartGroupTotals[];
}
export interface CartView {
  couponCode: string | null;
  itemCount: number;
  groups: {
    merchantId: string;
    merchant: string;
    merchantLogoUrl: string | null;
    storeId: string;
    etaMinutes: number | null;
    distanceKm: number | null;
    /** Taxa de entrega efetiva do grupo (story 58); 0 na retirada. */
    deliveryFeeCents: number;
    /** Pedido mínimo da loja (story 58); null = sem mínimo. */
    minOrderCents: number | null;
    /** Quanto falta p/ atingir o mínimo (story 58); 0 quando atingido ou sem mínimo. */
    missingForMinCents: number;
    /** Loja permite retirada — sugere retirada quando fora do raio (story 58). */
    allowsPickup: boolean;
    /** Rede suspensa pela plataforma (story 69): aviso no carrinho; checkout bloqueia. */
    merchantSuspended: boolean;
    items: CartItemView[];
  }[];
  totals: CartTotals;
}

/**
 * Cupom disponível no carrinho (story 74) — resposta do `GET /cart/coupons`.
 * Contrato espelhado em `@markethub/types` (`availableCouponSchema`). Card exibe
 * `title ?? code`; `applicable: false` traz `reason` com quanto falta.
 */
export interface AvailableCoupon {
  code: string;
  title: string | null;
  description: string | null;
  type: "fixed" | "percent" | "free_shipping";
  value: number;
  merchantId: string | null;
  minOrderCents: number | null;
  discountCents: number;
  applicable: boolean;
  reason: { code: "MIN_ORDER_NOT_MET"; missingCents: number } | null;
}

export interface Address {
  id: string;
  label: string;
  street: string;
  number: string;
  district?: string | null;
  city: string;
  state: string;
  zipCode: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
}

export interface OrderSummary {
  id: string;
  status: string;
  totalCents: number;
  createdAt: string;
  deliveryCode: string | null;
  scheduledFrom: string | null;
  scheduledTo: string | null;
  addressSnapshot: { street?: string; number?: string } | null;
  groups: { fulfillment: "delivery" | "pickup" }[];
  payment: { status: string } | null;
  refund: { amountCents: number; status: string } | null;
}

// Rastreio por etapas do pedido (S5.1)
export interface PickingProgress {
  total: number;
  toApprove: number;
  picked: number;
  refused: number;
  pending: number;
}
export interface OrderTrackingGroup {
  orderGroupId: string;
  storeId: string;
  storeName: string;
  /** Coordenadas da loja (origem no mapa de rastreio ao vivo, story 51). */
  storeLat: number | null;
  storeLng: number | null;
  merchantId: string;
  merchantName: string;
  merchantLogoUrl: string | null;
  fulfillment: "delivery" | "pickup";
  status: string;
  subtotalCents: number;
  picking: PickingProgress | null;
  delivery: { status: string; driverName: string | null } | null;
}
export interface OrderTracking {
  orderId: string;
  status: string;
  deliveryCode: string | null;
  hasPickup: boolean;
  hasDelivery: boolean;
  etaWindow: { from: string; to: string } | null;
  address: {
    street: string;
    number: string;
    city: string | null;
    /** Coordenadas do destino (marcador de entrega no mapa, story 51). */
    lat: number | null;
    lng: number | null;
  } | null;
  totalCents: number;
  groups: OrderTrackingGroup[];
  updatedAt: string;
}

/** Payload do evento `driver:location` (posição efêmera do entregador, story 51). */
export interface DriverLocationEvent {
  v: number;
  deliveryId: string;
  orderId: string;
  lat: number;
  lng: number;
  heading: number | null;
  recordedAt: string;
}

// Substituição proposta pelo separador aguardando decisão do cliente (S3.4)
export interface SubstitutionView {
  id: string;
  pickItemId: string;
  originalName: string;
  originalUnitPriceCents: number;
  substituteName: string;
  substituteUnitPriceCents: number;
  priceDiffCents: number;
  approvalStatus: "pending" | "approved" | "rejected";
}

// Agendamento por slot (S5.3)
export interface SlotView {
  id: string;
  storeId: string;
  start: string;
  end: string;
  capacity: number;
  reserved: number;
  remaining: number;
}

// Avaliações e gorjeta (S5.2)
export type ReviewAxis = "platform" | "delivery" | "merchant";
export interface Review {
  id: string;
  orderId: string;
  axis: ReviewAxis;
  rating: number;
  comment: string | null;
  targetMerchantId: string | null;
  targetDriverId: string | null;
  createdAt: string;
}
export interface TipView {
  id: string;
  orderId: string;
  driverId: string;
  amountCents: number;
  status: "pending" | "paid" | "failed";
  qrCode: string | null;
  qrCodeUrl: string | null;
  expiresAt: string | null;
  paidAt: string | null;
}

export interface FeedItem extends ProductView {
  storeId: string;
  merchant: string;
  merchantLogoUrl: string | null;
  deliveryFeeCents: number;
  deliveryEta: string;
  etaMinutes: number;
  distanceKm: number | null;
  /** Loja aberta agora (story 52) — dirige o selo "Fechado" no card. */
  openNow: boolean;
  /** Loja em pausa temporária (story 57) — selo "Pausada" no card (pausa força fechado). */
  paused: boolean;
}
export interface FeedSection {
  category: { id: string; name: string; slug: string };
  items: FeedItem[];
}

/** Posição + raio (S6.4) anexados às consultas de vitrine. */
export interface GeoQuery {
  lat: number;
  lng: number;
  radiusKm?: number;
}

/** Meta da loja na vitrine (S6.4/S6.7). */
export interface StoreMeta {
  id: string;
  name: string;
  /** Rede (merchant) da loja — alvo das avaliações públicas (story 56). */
  merchantId: string;
  merchantName: string;
  merchantLogoUrl: string | null;
  /** Taxa de entrega efetiva da loja (story 58): override da loja > tarifa da rede. */
  deliveryFeeCents: number;
  /** Pedido mínimo da loja (story 58); null = sem mínimo. */
  minOrderCents: number | null;
  /** Raio de entrega da loja em km (story 58); null = sem limite além da cidade. */
  deliveryRadiusKm: number | null;
  distanceKm: number | null;
  etaMinutes: number;
  /** Se o cliente logado já segue esta loja (story 34). Guest → false. */
  following: boolean;
  /** Loja aberta agora (story 52). */
  openNow: boolean;
  /** Loja em pausa temporária (story 57): força `openNow=false` e badge "Pausada". */
  paused: boolean;
  /** Faixa de hoje (minutos) ou null = hoje fechado (folga/feriado). */
  todayHours: { opensAt: number; closesAt: number } | null;
  /** Próxima abertura (dia da semana + minuto) p/ "abre às HH:MM"; null se sem horário. */
  nextOpen: { dayOfWeek: number; opensAt: number } | null;
}

/** Loja seguida pelo cliente (story 34). */
export interface FollowedStoreView {
  storeId: string;
  createdAt: string;
  store: { id: string; name: string; merchantName: string; merchantLogoUrl: string | null };
}

/** Favorito de oferta (S6.5). */
export interface FavoriteView {
  offerId: string;
  createdAt: string;
  priceCents: number;
  promoPriceCents: number | null;
  available: boolean;
  product: {
    id: string;
    name: string;
    imageUrl: string | null;
    saleType: SaleType;
    packageSize: string | null;
  };
  store: { id: string; name: string; merchantName: string; merchantLogoUrl: string | null };
}

export interface CoveredCity {
  city: string;
  state: string;
}

export interface ProductDetail {
  id: string;
  name: string;
  brand: string | null;
  packageSize: string | null;
  saleType: SaleType;
  imageUrl: string | null;
  description: string | null;
  gtin: string | null;
  category: { name: string } | null;
  /** Pergunta de preparo do departamento (S6.6); null = sem pergunta. */
  prepOptions: { label: string; options: string[] } | null;
  offers: {
    id: string;
    priceCents: number;
    promoPriceCents: number | null;
    store: { id: string; name: string; merchant: { name: string; logoUrl: string | null } };
  }[];
}

export interface PaymentView {
  status: string;
  amountCents: number;
  qrCode: string | null;
  qrCodeUrl: string | null;
  expiresAt: string | null;
  paidAt: string | null;
}

/** Wrapper tipado sobre o ApiClient para o marketplace. */
export function marketplace(api: ApiClient) {
  const geoQs = (qs: URLSearchParams, geo?: GeoQuery) => {
    if (!geo) return qs;
    qs.set("lat", String(geo.lat));
    qs.set("lng", String(geo.lng));
    if (geo.radiusKm != null) qs.set("radiusKm", String(geo.radiusKm));
    return qs;
  };

  return {
    feed: (geo?: GeoQuery) =>
      api.request<FeedSection[]>(`/feed?${geoQs(new URLSearchParams(), geo)}`),
    categoryFeed: (categoryId: string, opts?: { q?: string; storeId?: string; geo?: GeoQuery }) => {
      const qs = geoQs(new URLSearchParams({ pageSize: "50" }), opts?.geo);
      if (opts?.q) qs.set("q", opts.q);
      if (opts?.storeId) qs.set("storeId", opts.storeId);
      return api.request<{ category: FeedSection["category"]; items: FeedItem[] }>(
        `/marketplace-categories/${categoryId}/feed?${qs}`,
      );
    },
    productDetail: (productId: string) => api.request<ProductDetail>(`/products/${productId}`),
    merchants: () => api.request<Merchant[]>("/merchants"),
    stores: (merchantId: string) => api.request<Store[]>(`/merchants/${merchantId}/stores`),
    /** Mercados ativos dentro do viewport do mapa (bbox) — explore (stories 04/05/06). */
    storesNearby: (bounds: ViewportBoundsDTO) =>
      api.request<NearbyStoreDTO[]>(
        `/stores/nearby?north=${bounds.north}&south=${bounds.south}&east=${bounds.east}&west=${bounds.west}`,
      ),
    /** Resumo da loja para o modal do explore (story 29), buscado ao tocar o marker. */
    storeSummary: (id: string) => api.request<StoreSummaryDTO>(`/stores/${id}/summary`),
    products: (storeId: string, page = 1) =>
      api.request<Paginated<ProductView>>(`/stores/${storeId}/products?page=${page}&pageSize=30`),
    search: (storeId: string, q: string) =>
      api.request<Paginated<ProductView>>(
        `/search?storeId=${storeId}&q=${encodeURIComponent(q)}`,
      ),
    sections: (storeId: string, geo?: GeoQuery) =>
      // auth opcional (story 34): com token, `store.following` reflete o usuário.
      api.request<{
        store: StoreMeta;
        featured: ProductView[];
        mostBought: ProductView[];
        recommended: ProductView[];
      }>(`/stores/${storeId}/sections?${geoQs(new URLSearchParams(), geo)}`, { auth: true }),
    categories: () =>
      api.request<{ id: string; name: string; slug: string }[]>(
        "/marketplace-categories",
      ),

    getCart: () => api.request<CartView>("/cart", { auth: true }),
    addItem: (body: { offerId: string; quantity?: number; weightGrams?: number; note?: string }) =>
      api.request<CartView>("/cart/items", { method: "POST", auth: true, body }),
    updateItem: (id: string, body: { quantity?: number; weightGrams?: number }) =>
      api.request<CartView>(`/cart/items/${id}`, { method: "PATCH", auth: true, body }),
    removeItem: (id: string) =>
      api.request<CartView>(`/cart/items/${id}`, { method: "DELETE", auth: true }),
    availableCoupons: () =>
      api.request<AvailableCoupon[]>("/cart/coupons", { auth: true }),
    applyCoupon: (code: string) =>
      api.request<CartView>("/cart/coupon", { method: "POST", auth: true, body: { code } }),
    removeCoupon: () => api.request<CartView>("/cart/coupon", { method: "DELETE", auth: true }),

    addresses: () => api.request<Address[]>("/addresses", { auth: true }),
    addAddress: (body: Partial<Address>) =>
      api.request<Address>("/addresses", { method: "POST", auth: true, body }),
    updateAddress: (id: string, body: Partial<Address>) =>
      api.request<Address>(`/addresses/${id}`, { method: "PATCH", auth: true, body }),
    removeAddress: (id: string) =>
      api.request<{ id: string }>(`/addresses/${id}`, { method: "DELETE", auth: true }),
    setDefaultAddress: (id: string) =>
      api.request<Address>(`/addresses/${id}/default`, { method: "POST", auth: true }),
    coverageCities: () => api.request<CoveredCity[]>("/coverage/cities"),
    /** GPS → endereço estruturado pelo backend (story 76); null quando não resolve. */
    reverseGeocode: (lat: number, lng: number) =>
      api.request<ReverseGeocodeResult | null>(
        `/geocoding/reverse?lat=${lat}&lng=${lng}`,
        { auth: true },
      ),

    favorites: () => api.request<FavoriteView[]>("/favorites", { auth: true }),
    addFavorite: (offerId: string) =>
      api.request<{ id: string }>("/favorites", { method: "POST", auth: true, body: { offerId } }),
    removeFavorite: (offerId: string) =>
      api.request<{ removed: boolean }>(`/favorites/${offerId}`, { method: "DELETE", auth: true }),

    // Seguir loja (story 34)
    followedStores: () => api.request<FollowedStoreView[]>("/store-follows", { auth: true }),
    followStore: (storeId: string) =>
      api.request<{ id: string }>("/store-follows", { method: "POST", auth: true, body: { storeId } }),
    unfollowStore: (storeId: string) =>
      api.request<{ storeId: string; removed: boolean }>(`/store-follows/${storeId}`, {
        method: "DELETE",
        auth: true,
      }),

    slots: (storeId: string) => api.request<SlotView[]>(`/stores/${storeId}/slots`, { auth: true }),
    checkout: (body: {
      fulfillment: "delivery" | "pickup";
      addressId?: string | null;
      deliveryMethod?: "gate" | "door";
      deliverySlotId?: string | null;
    }) => api.request<{ id: string }>("/checkout", { method: "POST", auth: true, body }),
    orders: () => api.request<{ items: OrderSummary[] }>("/orders", { auth: true }),
    order: (id: string) => api.request<Record<string, unknown>>(`/orders/${id}`, { auth: true }),
    tracking: (id: string) => api.request<OrderTracking>(`/orders/${id}/tracking`, { auth: true }),
    cancelOrder: (id: string) =>
      api.request<{ id: string; status: string }>(`/orders/${id}/cancel`, { method: "POST", auth: true }),

    substitutions: (orderId: string) =>
      api.request<SubstitutionView[]>(`/orders/${orderId}/substitutions`, { auth: true }),
    approveSubstitution: (orderId: string, subId: string) =>
      api.request<SubstitutionView>(`/orders/${orderId}/substitutions/${subId}/approve`, {
        method: "POST",
        auth: true,
      }),
    rejectSubstitution: (orderId: string, subId: string) =>
      api.request<SubstitutionView>(`/orders/${orderId}/substitutions/${subId}/reject`, {
        method: "POST",
        auth: true,
      }),

    // Vitrine pública de avaliações da rede (story 56) — sem auth, alinhada ao catálogo.
    storeReviews: (merchantId: string, page = 1) =>
      api.request<StoreReviewsPageDTO>(
        `/merchants/${encodeURIComponent(merchantId)}/reviews?axis=merchant&page=${page}`,
      ),

    reviews: (id: string) => api.request<Review[]>(`/orders/${id}/reviews`, { auth: true }),
    createReview: (
      id: string,
      body: { axis: ReviewAxis; rating: number; comment?: string; merchantId?: string },
    ) => api.request<Review>(`/orders/${id}/reviews`, { method: "POST", auth: true, body }),
    tip: (id: string) => api.request<TipView>(`/orders/${id}/tip`, { auth: true }),
    createTip: (id: string, amountCents: number) =>
      api.request<TipView>(`/orders/${id}/tip`, { method: "POST", auth: true, body: { amountCents } }),
    mockPayTip: (id: string) =>
      api.request<{ handled: boolean }>(`/orders/${id}/tip/mock-pay`, { method: "POST", auth: true }),

    pay: (orderId: string) =>
      api.request<PaymentView>(`/orders/${orderId}/pay`, { method: "POST", auth: true }),
    paymentStatus: (orderId: string) =>
      api.request<PaymentView>(`/orders/${orderId}/payment`, { auth: true }),
    mockPay: (orderId: string) =>
      api.request<{ handled: boolean }>(`/orders/${orderId}/mock-pay`, {
        method: "POST",
        auth: true,
      }),
  };
}

export const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
