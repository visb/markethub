/**
 * Chaves de query centralizadas (CLAUDE.md: NUNCA string literal como query key
 * fora deste arquivo). Estruturadas por recurso para invalidação granular.
 */
import type { ViewportBoundsDTO } from "@markethub/types";

export const queryKeys = {
  products: {
    /** Detalhe de um produto (modal de produto, story 31). */
    detail: (id: string) => ["products", "detail", id] as const,
  },
  favorites: {
    /** Favoritos de oferta do usuário autenticado (story 31). */
    all: ["favorites"] as const,
  },
  storeFollows: {
    /** Lojas seguidas pelo usuário autenticado (story 34). */
    all: ["store-follows"] as const,
    /** Estado seguido/não-seguido de uma loja específica. */
    status: (storeId: string) => ["store-follows", "status", storeId] as const,
  },
  storeReviews: {
    /** Vitrine pública paginada das avaliações da rede (story 56). */
    byMerchant: (merchantId: string) => ["store-reviews", merchantId] as const,
  },
  tracking: {
    /** Snapshot de rastreio (OrderTracking) de um pedido. */
    order: (orderId: string) => ["tracking", "order", orderId] as const,
    /** Substituições pendentes de um pedido. */
    substitutions: (orderId: string) => ["tracking", "substitutions", orderId] as const,
  },
  tip: {
    /** Gorjeta (agregado + itens) de um pedido, quando já criada (story 77). */
    view: (orderId: string) => ["tip", "view", orderId] as const,
    /** Alvos possíveis da gorjeta do pedido (entregador? mercados?). */
    targets: (orderId: string) => ["tip", "targets", orderId] as const,
  },
  prefs: {
    /** Raio de busca escolhido pelo usuário (storage local — story 80). */
    radiusKm: ["prefs", "radius-km"] as const,
  },
  search: {
    /** Sugestões conforme digita (termos + departamentos — story 80). */
    suggestions: (q: string) => ["search", "suggestions", q] as const,
    /** Resultado paginado da busca global, chaveado por termo + recorte geo (story 80). */
    results: (q: string, geo?: { lat: number; lng: number; radiusKm?: number }) =>
      ["search", "results", q, geo?.lat ?? null, geo?.lng ?? null, geo?.radiusKm ?? null] as const,
  },
  explore: {
    /** Mercados dentro do viewport do mapa (bounding box). */
    nearby: (bounds: ViewportBoundsDTO) =>
      ["explore", "nearby", bounds.north, bounds.south, bounds.east, bounds.west] as const,
    /** Posição atual do dispositivo (GPS) — centro inicial do mapa. */
    deviceLocation: ["explore", "device-location"] as const,
    /** Resumo da loja exibido no modal ao tocar o marker (story 29). */
    storeSummary: (id: string) => ["explore", "store-summary", id] as const,
  },
  addresses: {
    /** Endereços do usuário autenticado. */
    all: ["addresses"] as const,
  },
  cart: {
    /** Cupons disponíveis para o carrinho atual (story 74). */
    availableCoupons: ["cart", "available-coupons"] as const,
  },
  account: {
    /** Perfil do usuário autenticado (conta — story 70). */
    me: ["account", "me"] as const,
  },
} as const;
