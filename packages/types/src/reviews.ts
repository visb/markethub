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
