import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { saoPauloNow } from "../shared/store-hours";
import { AdminDashboardService } from "./admin-dashboard.service";

/**
 * Thresholds fixos do dashboard admin (story 66). Configuração por env/UI ficou
 * explicitamente fora de escopo — mudar aqui exige deploy, e está ok por ora.
 */
export const QUEUE_AGE_THRESHOLD_MIN = 15;
export const OUTBOX_BACKLOG_THRESHOLD_MIN = 5;
export const ERP_SYNC_STALE_HOURS = 24;

export type DashboardAlertSeverity = "critical" | "warning";
export type DashboardAlertCode = "OUTBOX_BACKLOG" | "ERP_SYNC_STALE" | "PAYMENTS_STUCK";

export interface DashboardAlert {
  severity: DashboardAlertSeverity;
  code: DashboardAlertCode;
  message: string;
  count: number;
}

export interface DashboardKpis {
  ordersPaidToday: number;
  /** Variação % vs ontem; null quando ontem foi zero (divisão indefinida). */
  ordersPaidDeltaPct: number | null;
  gmvTodayCents: number;
  gmvDeltaPct: number | null;
  avgTicketCents: number;
  activeStores: number;
  /** Lojas ativas em pausa de emergência (story 57). */
  pausedStores: number;
}

export interface DashboardQueues {
  pickingQueuedOver15Min: number;
  deliveriesUnassignedOver15Min: number;
  pickupsAwaiting: number;
  deliveriesFailedAwaitingDecision: number;
}

export interface AdminDashboardSummary {
  kpis: DashboardKpis;
  queues: DashboardQueues;
  alerts: DashboardAlert[];
}

/** Delta % hoje×ontem; ontem zero → null (o front mostra "—"). */
function deltaPct(today: number, yesterday: number): number | null {
  if (yesterday === 0) return null;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

/**
 * Agregador do dashboard admin (story 66): KPIs de hoje×ontem (janela em
 * America/Sao_Paulo), filas operacionais acima do limiar e alertas anômalos
 * (outbox parado, sync ERP stale, PIX pendente vencido). Uma chamada só —
 * evita N queries do front. Reusa o financeiro do AdminDashboardService.
 */
@Injectable()
export class AdminDashboardSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: AdminDashboardService,
  ) {}

  async summary(now: Date = new Date()): Promise<AdminDashboardSummary> {
    const [kpis, queues, alerts] = await Promise.all([
      this.kpis(now),
      this.queues(now),
      this.alerts(now),
    ]);
    return { kpis, queues, alerts };
  }

  private async kpis(now: Date): Promise<DashboardKpis> {
    // Meia-noite local em America/Sao_Paulo (UTC-3 fixo — sem horário de verão
    // desde 2019); a data local vem do kernel compartilhado (Intl).
    const { dateISO } = saoPauloNow(now);
    const todayStart = new Date(`${dateISO}T00:00:00-03:00`);
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    const [today, yesterday, activeStores, pausedStores] = await Promise.all([
      this.dashboard.finance({ from: todayStart, to: now }),
      // `finance` usa lte — recua 1ms p/ não contar o pagamento exatamente à meia-noite duas vezes
      this.dashboard.finance({ from: yesterdayStart, to: new Date(todayStart.getTime() - 1) }),
      this.prisma.store.count({ where: { active: true, pausedAt: null } }),
      this.prisma.store.count({ where: { active: true, pausedAt: { not: null } } }),
    ]);

    return {
      ordersPaidToday: today.ordersPaid,
      ordersPaidDeltaPct: deltaPct(today.ordersPaid, yesterday.ordersPaid),
      gmvTodayCents: today.salesCents,
      gmvDeltaPct: deltaPct(today.salesCents, yesterday.salesCents),
      avgTicketCents:
        today.ordersPaid === 0 ? 0 : Math.round(today.salesCents / today.ordersPaid),
      activeStores,
      pausedStores,
    };
  }

  private async queues(now: Date): Promise<DashboardQueues> {
    const ageLimit = new Date(now.getTime() - QUEUE_AGE_THRESHOLD_MIN * 60_000);
    const [picking, unassigned, pickups, failed] = await Promise.all([
      this.prisma.pickTask.count({ where: { status: "queued", createdAt: { lt: ageLimit } } }),
      this.prisma.delivery.count({ where: { status: "unassigned", createdAt: { lt: ageLimit } } }),
      this.prisma.orderGroup.count({ where: { fulfillment: "pickup", status: "ready_for_pickup" } }),
      // falha reportada pelo entregador aguardando decisão da loja (story 61)
      this.prisma.delivery.count({ where: { status: "failed" } }),
    ]);
    return {
      pickingQueuedOver15Min: picking,
      deliveriesUnassignedOver15Min: unassigned,
      pickupsAwaiting: pickups,
      deliveriesFailedAwaitingDecision: failed,
    };
  }

  private async alerts(now: Date): Promise<DashboardAlert[]> {
    const outboxBefore = new Date(now.getTime() - OUTBOX_BACKLOG_THRESHOLD_MIN * 60_000);
    const [outbox, erpStale, paymentsStuck] = await Promise.all([
      this.prisma.outboxEvent.count({
        where: { publishedAt: null, createdAt: { lt: outboxBefore } },
      }),
      this.erpStaleMerchants(now),
      // PIX pendente além da janela: o webhook de expiração deveria tê-lo encerrado
      this.prisma.payment.count({ where: { status: "pending", expiresAt: { lt: now } } }),
    ]);

    const alerts: DashboardAlert[] = [];
    if (outbox > 0) {
      alerts.push({
        severity: "critical",
        code: "OUTBOX_BACKLOG",
        message: `${outbox} evento(s) do outbox sem publicar há mais de ${OUTBOX_BACKLOG_THRESHOLD_MIN} min`,
        count: outbox,
      });
    }
    if (paymentsStuck > 0) {
      alerts.push({
        severity: "critical",
        code: "PAYMENTS_STUCK",
        message: `${paymentsStuck} pagamento(s) PIX pendente(s) além da janela de expiração`,
        count: paymentsStuck,
      });
    }
    if (erpStale > 0) {
      alerts.push({
        severity: "warning",
        code: "ERP_SYNC_STALE",
        message: `${erpStale} rede(s) com sync ERP falho ou sem execução há mais de ${ERP_SYNC_STALE_HOURS}h`,
        count: erpStale,
      });
    }
    return alerts;
  }

  /**
   * Merchants com conector ERP cujo último SyncRun falhou ou que não rodam há
   * mais de 24h (inclui quem nunca rodou). SyncRun referencia storeId — o último
   * run da rede é o mais recente entre as lojas dela.
   */
  private async erpStaleMerchants(now: Date): Promise<number> {
    const merchants = await this.prisma.merchant.findMany({
      where: { active: true, connectorType: { not: null } },
      select: { id: true, stores: { select: { id: true } } },
    });
    if (merchants.length === 0) return 0;

    const staleBefore = new Date(now.getTime() - ERP_SYNC_STALE_HOURS * 3_600_000);
    const lastRuns = await Promise.all(
      merchants.map((m) =>
        this.prisma.syncRun.findFirst({
          where: { storeId: { in: m.stores.map((s) => s.id) } },
          orderBy: { startedAt: "desc" },
          select: { status: true, startedAt: true },
        }),
      ),
    );
    return lastRuns.filter((run) => !run || run.status === "failed" || run.startedAt < staleBefore)
      .length;
  }
}
