import type { ApiClient } from "@markethub/api-client";

/**
 * Módulo de API tipado dos pedidos no admin (story 67): lista com busca do
 * suporte, detalhe profundo, timeline e ações (cancelar / reembolso manual).
 * Shapes espelham o backend (`admin/dashboard/orders`); tipado local como as
 * páginas vizinhas — não é contrato compartilhado com os apps mobile.
 */

export interface AdminOrderRow {
  id: string;
  status: string;
  totalCents: number;
  createdAt: string;
  customer: string;
  paymentStatus: string | null;
  refundCents: number;
  stores: string[];
  fulfillments: string[];
}

export interface AdminOrdersResponse {
  items: AdminOrderRow[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<string, number>;
}

export interface AdminOrdersFilter {
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminOrderItem {
  id: string;
  nameSnapshot: string;
  saleType: "unit" | "weight";
  unitPriceCents: number;
  quantity: number;
  weightGrams: number | null;
  lineTotalCents: number;
  pickItem: {
    status: string;
    quantityPicked: number | null;
    weightGramsPicked: number | null;
    substitution: {
      nameSnapshot: string;
      unitPriceCents: number;
      approvalStatus: string;
    } | null;
  } | null;
}

export interface AdminOrderGroup {
  id: string;
  status: string;
  fulfillment: string;
  subtotalCents: number;
  deliveryCents: number;
  prepCents: number;
  platformFeeCents: number;
  merchant: { name: string };
  store: { name: string };
  items: AdminOrderItem[];
  pickTask: { id: string; status: string; pickerId: string | null } | null;
  delivery: { id: string; status: string; driver: { name: string } | null } | null;
}

export interface AdminRefundComponent {
  id: string;
  orderGroupId: string;
  amountCents: number;
  reason: string;
  createdById: string | null;
}

export interface AdminOrderDetail {
  id: string;
  status: string;
  createdAt: string;
  itemsCents: number;
  deliveryCents: number;
  prepCents: number;
  platformFeeCents: number;
  discountCents: number;
  totalCents: number;
  couponCode: string | null;
  user: { name: string; email: string };
  payment: {
    status: string;
    amountCents: number;
    provider: string;
    paidAt: string | null;
  } | null;
  refund: {
    status: string;
    amountCents: number;
    components: AdminRefundComponent[];
  } | null;
  groups: AdminOrderGroup[];
}

/** Item da timeline vertical (merge outbox + marcos, já ordenado pelo backend). */
export interface AdminOrderTimelineItem {
  at: string;
  kind: string;
  label: string;
  meta: Record<string, unknown> | null;
}

export interface AdminManualRefundInput {
  orderGroupId: string;
  amountCents: number;
  note?: string | null;
}

export interface AdminManualRefundResult {
  componentId: string;
  orderGroupId: string;
  amountCents: number;
  remainingCents: number;
  status: "requested";
}

export function listAdminOrders(
  api: ApiClient,
  filter: AdminOrdersFilter,
): Promise<AdminOrdersResponse> {
  const params = new URLSearchParams({
    page: String(filter.page ?? 1),
    pageSize: String(filter.pageSize ?? 20),
  });
  if (filter.status) params.set("status", filter.status);
  if (filter.q) params.set("q", filter.q);
  return api.request<AdminOrdersResponse>(`/admin/dashboard/orders?${params}`, { auth: true });
}

export function getAdminOrder(api: ApiClient, id: string): Promise<AdminOrderDetail> {
  return api.request<AdminOrderDetail>(`/admin/dashboard/orders/${id}`, { auth: true });
}

export function getAdminOrderTimeline(
  api: ApiClient,
  id: string,
): Promise<AdminOrderTimelineItem[]> {
  return api.request<AdminOrderTimelineItem[]>(`/admin/dashboard/orders/${id}/timeline`, {
    auth: true,
  });
}

export function cancelAdminOrder(api: ApiClient, id: string, reason?: string) {
  return api.request<{ id: string; status: string }>(`/admin/dashboard/orders/${id}/cancel`, {
    method: "POST",
    auth: true,
    body: reason ? { reason } : {},
  });
}

export function refundAdminOrder(
  api: ApiClient,
  id: string,
  input: AdminManualRefundInput,
): Promise<AdminManualRefundResult> {
  return api.request<AdminManualRefundResult>(`/admin/dashboard/orders/${id}/refund`, {
    method: "POST",
    auth: true,
    body: {
      orderGroupId: input.orderGroupId,
      amountCents: input.amountCents,
      ...(input.note ? { note: input.note } : {}),
    },
  });
}
