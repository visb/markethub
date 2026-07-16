// Avaliações multi-eixo e gorjeta (S5.2)

export type ReviewAxisDTO = "platform" | "delivery" | "merchant";
export type TipStatusDTO = "pending" | "paid" | "failed";

export interface ReviewDTO {
  id: string;
  orderId: string;
  axis: ReviewAxisDTO;
  rating: number; // 1..5
  comment: string | null;
  targetMerchantId: string | null;
  targetDriverId: string | null;
  createdAt: string;
}

export interface CreateReviewInput {
  axis: ReviewAxisDTO;
  rating: number;
  comment?: string;
}

export interface TipDTO {
  id: string;
  orderId: string;
  driverId: string;
  amountCents: number;
  status: TipStatusDTO;
  qrCode: string | null;
  qrCodeUrl: string | null;
  expiresAt: string | null;
  paidAt: string | null;
}

/** Média de avaliações agregada por eixo/alvo (admin/merchant). */
export interface ReviewAggregateDTO {
  axis: ReviewAxisDTO;
  average: number; // 0..5
  count: number;
}

// ── Vitrine pública + resposta do lojista (story 56) ──

/** Item da vitrine pública de avaliações da rede (eixo merchant). */
export interface StoreReviewDTO {
  id: string;
  rating: number; // 1..5
  comment: string | null;
  /** Primeiro nome do autor (privacidade — nunca o nome completo). */
  authorName: string;
  createdAt: string;
  /** Resposta do lojista (null se ainda não respondeu). */
  replyText: string | null;
  repliedAt: string | null;
}

/** Página da vitrine pública de avaliações da rede: média + contagem + itens. */
export interface StoreReviewsPageDTO {
  average: number; // 0..5
  count: number;
  page: number;
  pageSize: number;
  items: StoreReviewDTO[];
}

/** Item de gestão de avaliações no app merchant (inclui a rede-alvo). */
export interface MerchantReviewDTO extends StoreReviewDTO {
  merchantId: string | null;
}

/** Filtros da listagem de gestão de avaliações (story 56). */
export interface MerchantReviewsFilter {
  rating?: number;
  unanswered?: boolean;
}

/** Corpo da resposta do lojista a uma avaliação (1–1000 chars). */
export interface ReplyReviewInput {
  text: string;
}

// ── Moderação de avaliações pelo admin (story 68) ──

/** Item da listagem plana de moderação no admin: review + alvo + estado. */
export interface AdminReviewDTO {
  id: string;
  orderId: string;
  axis: ReviewAxisDTO;
  rating: number; // 1..5
  comment: string | null;
  /** Nome do autor (admin vê o nome completo; "Cliente" quando ausente). */
  authorName: string;
  createdAt: string;
  /** Resposta do lojista (story 56), se houver. */
  replyText: string | null;
  repliedAt: string | null;
  /** Merchant alvo (eixo merchant/delivery) — null no eixo platform. */
  merchantId: string | null;
  merchantName: string | null;
  /** Soft-hide reversível (story 68): oculta sai da vitrine e das médias. */
  hidden: boolean;
  hiddenAt: string | null;
  hiddenReason: string | null;
  hiddenByName: string | null;
}

/** Filtros da listagem de moderação. `hidden` undefined = todas. */
export interface AdminReviewsFilter {
  rating?: number;
  hidden?: boolean;
  merchantId?: string;
  q?: string;
}

/** Corpo do soft-hide — motivo obrigatório (trilha de por quê). */
export interface HideReviewInput {
  reason: string;
}
