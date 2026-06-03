import { useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-context";

interface Operations {
  picking: Record<string, number>;
  deliveries: Record<string, number>;
  pendingPickups: number;
  sla: { oldestQueuedPickMin: number | null; oldestUnassignedDeliveryMin: number | null };
}

const PICK_STATES = ["queued", "assigned", "picking", "packed", "ready_for_pickup"];
const DELIVERY_STATES = ["unassigned", "assigned", "picked_up", "delivered"];

export function Operations() {
  const { api } = useAuth();
  const [ops, setOps] = useState<Operations | null>(null);

  useEffect(() => {
    void api.request<Operations>("/admin/dashboard/operations", { auth: true }).then(setOps);
  }, [api]);

  if (!ops) return <div><h1>Operação</h1><p className="muted">Carregando…</p></div>;

  return (
    <div>
      <h1>Operação</h1>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel title="Separação (filas)">
          <CountList states={PICK_STATES} counts={ops.picking} />
        </Panel>
        <Panel title="Entregas">
          <CountList states={DELIVERY_STATES} counts={ops.deliveries} />
        </Panel>
        <Panel title="Retiradas pendentes">
          <Big value={ops.pendingPickups} label="aguardando retirada na loja" />
        </Panel>
        <Panel title="SLA básico">
          <div className="muted">Separação mais antiga na fila</div>
          <Big value={ops.sla.oldestQueuedPickMin ?? 0} label="min" />
          <div className="muted" style={{ marginTop: 8 }}>Entrega não atribuída mais antiga</div>
          <Big value={ops.sla.oldestUnassignedDeliveryMin ?? 0} label="min" />
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {children}
    </div>
  );
}

function CountList({ states, counts }: { states: string[]; counts: Record<string, number> }) {
  return (
    <table className="table">
      <tbody>
        {states.map((s) => (
          <tr key={s}>
            <td><span className={`badge badge-${s}`}>{s}</span></td>
            <td style={{ textAlign: "right", fontWeight: 600 }}>{counts[s] ?? 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Big({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <span style={{ fontSize: 28, fontWeight: 700 }}>{value}</span>{" "}
      <span className="muted">{label}</span>
    </div>
  );
}
