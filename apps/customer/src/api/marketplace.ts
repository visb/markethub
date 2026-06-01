import type { ApiClient } from "@markethub/api-client";

export type SaleType = "unit" | "weight";

export interface Merchant {
  id: string;
  name: string;
  slug: string;
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
export interface CartTotals {
  itemsCents: number;
  deliveryCents: number;
  prepCents: number;
  platformFeeCents: number;
  discountCents: number;
  doorSurchargeCents: number;
  totalCents: number;
}
export interface CartView {
  couponCode: string | null;
  itemCount: number;
  groups: { merchantId: string; merchant: string; storeId: string; items: CartItemView[] }[];
  totals: CartTotals;
}

export interface Address {
  id: string;
  label: string;
  street: string;
  number: string;
  city: string;
  state: string;
  zipCode: string;
  isDefault: boolean;
}

export interface OrderSummary {
  id: string;
  status: string;
  totalCents: number;
  createdAt: string;
  payment: { status: string } | null;
  refund: { amountCents: number; status: string } | null;
}

export interface FeedItem extends ProductView {
  storeId: string;
  merchant: string;
  deliveryFeeCents: number;
  deliveryEta: string;
  distanceKm: number | null;
}
export interface FeedSection {
  category: { id: string; name: string; slug: string };
  items: FeedItem[];
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
  offers: {
    id: string;
    priceCents: number;
    promoPriceCents: number | null;
    store: { id: string; name: string; merchant: { name: string } };
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
  return {
    feed: () => api.request<FeedSection[]>("/feed"),
    categoryFeed: (categoryId: string, opts?: { q?: string; storeId?: string }) => {
      const qs = new URLSearchParams({ pageSize: "50" });
      if (opts?.q) qs.set("q", opts.q);
      if (opts?.storeId) qs.set("storeId", opts.storeId);
      return api.request<{ category: FeedSection["category"]; items: FeedItem[] }>(
        `/marketplace-categories/${categoryId}/feed?${qs}`,
      );
    },
    productDetail: (productId: string) => api.request<ProductDetail>(`/products/${productId}`),
    merchants: () => api.request<Merchant[]>("/merchants"),
    stores: (merchantId: string) => api.request<Store[]>(`/merchants/${merchantId}/stores`),
    products: (storeId: string, page = 1) =>
      api.request<Paginated<ProductView>>(`/stores/${storeId}/products?page=${page}&pageSize=30`),
    search: (storeId: string, q: string) =>
      api.request<Paginated<ProductView>>(
        `/search?storeId=${storeId}&q=${encodeURIComponent(q)}`,
      ),
    sections: (storeId: string) =>
      api.request<{
        featured: ProductView[];
        mostBought: ProductView[];
        recommended: ProductView[];
      }>(`/stores/${storeId}/sections`),
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
    applyCoupon: (code: string) =>
      api.request<CartView>("/cart/coupon", { method: "POST", auth: true, body: { code } }),

    addresses: () => api.request<Address[]>("/addresses", { auth: true }),
    addAddress: (body: Partial<Address>) =>
      api.request<Address>("/addresses", { method: "POST", auth: true, body }),
    setDefaultAddress: (id: string) =>
      api.request<Address>(`/addresses/${id}/default`, { method: "POST", auth: true }),

    checkout: (body: { addressId: string; deliveryMethod: "gate" | "door" }) =>
      api.request<{ id: string }>("/checkout", { method: "POST", auth: true, body }),
    orders: () => api.request<{ items: OrderSummary[] }>("/orders", { auth: true }),
    order: (id: string) => api.request<Record<string, unknown>>(`/orders/${id}`, { auth: true }),

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
