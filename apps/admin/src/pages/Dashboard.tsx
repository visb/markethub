import { Link } from "react-router-dom";
import { useAuth } from "@/auth/auth-context";
import { useAdminDashboard } from "@/api/hooks/useAdminDashboard";
import type { DashboardAlert, DashboardAlertCode } from "@/api/dashboard";

const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;

/** Página do alerta correspondente: outbox → pedidos; ERP → runs; PIX → financeiro. */
const ALERT_LINK: Record<DashboardAlertCode, string> = {
  OUTBOX_BACKLOG: "/orders",
  ERP_SYNC_STALE: "/erp",
  PAYMENTS_STUCK: "/finance",
};

/**
 * Home do admin (story 66): KPIs de hoje×ontem, filas operacionais acima do
 * limiar e alertas anômalos. Dados do agregador `GET /admin/dashboard` via
 * useAdminDashboard (React Query, refresh 60s) — a página só orquestra.
 */
export function Dashboard() {
  const { user } = useAuth();
  const { data, isPending, isError } = useAdminDashboard();

  return (
    <div>
      <h1>Olá, {user?.name}</h1>
      <p className="muted">{user?.email}</p>

      {isPending && <p className="muted">Carregando dashboard…</p>}
      {isError && <p className="muted">Erro ao carregar o dashboard.</p>}

      {data && (
        <>
          <div className="cards">
            <KpiCard
              label="Pedidos pagos hoje"
              value={String(data.kpis.ordersPaidToday)}
              deltaPct={data.kpis.ordersPaidDeltaPct}
            />
            <KpiCard
              label="GMV hoje"
              value={brl(data.kpis.gmvTodayCents)}
              deltaPct={data.kpis.gmvDeltaPct}
            />
            <KpiCard label="Ticket médio" value={brl(data.kpis.avgTicketCents)} />
            <KpiCard
              label="Lojas"
              value={`${data.kpis.activeStores} ativas`}
              sub={
                data.kpis.pausedStores > 0
                  ? `${data.kpis.pausedStores} pausada(s)`
                  : "nenhuma pausada"
              }
            />
          </div>

          <h2 style={{ marginTop: 24 }}>Filas</h2>
          <div className="cards">
            <QueueCard
              label="Separação parada há +15 min"
              count={data.queues.pickingQueuedOver15Min}
              to="/operations"
            />
            <QueueCard
              label="Entregas sem entregador há +15 min"
              count={data.queues.deliveriesUnassignedOver15Min}
              to="/operations"
            />
            <QueueCard
              label="Retiradas aguardando"
              count={data.queues.pickupsAwaiting}
              to="/operations"
            />
            <QueueCard
              label="Entregas falhas (decisão pendente)"
              count={data.queues.deliveriesFailedAwaitingDecision}
              to="/operations"
            />
          </div>

          <h2 style={{ marginTop: 24 }}>Alertas</h2>
          {data.alerts.length === 0 ? (
            <p style={{ color: "#16a34a", fontWeight: 600 }}>Tudo em ordem ✓</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
              {data.alerts.map((alert) => (
                <AlertRow key={alert.code} alert={alert} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  deltaPct,
  sub,
}: {
  label: string;
  value: string;
  deltaPct?: number | null;
  sub?: string;
}) {
  return (
    <div className="card">
      <span className="card-label">{label}</span>
      <span className="card-value">{value}</span>
      {deltaPct !== undefined && <Delta pct={deltaPct} />}
      {sub && <span className="muted">{sub}</span>}
    </div>
  );
}

/** Variação vs ontem: verde ↑ / vermelho ↓; "—" quando ontem foi zero (delta null). */
function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="muted">— vs ontem</span>;
  const up = pct >= 0;
  return (
    <span style={{ color: up ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
      {up ? "↑" : "↓"} {Math.abs(pct)}% vs ontem
    </span>
  );
}

function QueueCard({ label, count, to }: { label: string; count: number; to: string }) {
  return (
    <div className="card">
      <span className="card-label">{label}</span>
      <span className="card-value" style={count > 0 ? { color: "#dc2626" } : undefined}>
        {count}
      </span>
      <Link to={to}>Ver fila</Link>
    </div>
  );
}

function AlertRow({ alert }: { alert: DashboardAlert }) {
  const critical = alert.severity === "critical";
  return (
    <li
      style={{
        border: `1px solid ${critical ? "#fecaca" : "#fde68a"}`,
        background: critical ? "#fef2f2" : "#fffbeb",
        borderRadius: 8,
        padding: "10px 14px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span style={{ color: critical ? "#b91c1c" : "#92400e" }}>
        <strong>{critical ? "Crítico" : "Atenção"}:</strong> {alert.message}
      </span>
      <Link to={ALERT_LINK[alert.code]}>Ver</Link>
    </li>
  );
}
