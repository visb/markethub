import type { ApiClient } from "@markethub/api-client";

/**
 * Módulo de API tipado do dashboard admin (story 66). Shape espelha o agregador
 * `GET /admin/dashboard` do backend; tipado local como as páginas vizinhas
 * (Finance/Operations) — não é contrato compartilhado com os apps mobile.
 */

export interface DashboardKpis {
  ordersPaidToday: number;
  /** Variação % vs ontem; null quando ontem foi zero. */
  ordersPaidDeltaPct: number | null;
  gmvTodayCents: number;
  gmvDeltaPct: number | null;
  avgTicketCents: number;
  activeStores: number;
  pausedStores: number;
}

export interface DashboardQueues {
  pickingQueuedOver15Min: number;
  deliveriesUnassignedOver15Min: number;
  pickupsAwaiting: number;
  deliveriesFailedAwaitingDecision: number;
}

export type DashboardAlertSeverity = "critical" | "warning";
export type DashboardAlertCode = "OUTBOX_BACKLOG" | "ERP_SYNC_STALE" | "PAYMENTS_STUCK";

export interface DashboardAlert {
  severity: DashboardAlertSeverity;
  code: DashboardAlertCode;
  message: string;
  count: number;
}

export interface AdminDashboardSummary {
  kpis: DashboardKpis;
  queues: DashboardQueues;
  alerts: DashboardAlert[];
}

export function getAdminDashboard(api: ApiClient): Promise<AdminDashboardSummary> {
  return api.request<AdminDashboardSummary>("/admin/dashboard", { auth: true });
}
