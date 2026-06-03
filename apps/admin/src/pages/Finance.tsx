import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-context";

interface Finance {
  ordersPaid: number;
  salesCents: number;
  platformFeeCents: number;
  refundsCents: number;
  tipsCents: number;
  tipsCount: number;
  estimatedMerchantPayoutCents: number;
}
interface DriverTip {
  driverId: string;
  driverName: string;
  totalCents: number;
  count: number;
}

const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;

export function Finance() {
  const { api } = useAuth();
  const [fin, setFin] = useState<Finance | null>(null);
  const [tips, setTips] = useState<DriverTip[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (from) q.set("from", new Date(from).toISOString());
    if (to) q.set("to", new Date(to).toISOString());
    const qs = q.toString() ? `?${q}` : "";
    void api.request<Finance>(`/admin/dashboard/finance${qs}`, { auth: true }).then(setFin);
    void api.request<DriverTip[]>(`/admin/dashboard/driver-tips${qs}`, { auth: true }).then(setTips);
  }, [api, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1>Financeiro</h1>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16 }}>
        <label>De<br /><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Até<br /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>

      {fin && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <Card label="Vendas (pagas)" value={brl(fin.salesCents)} sub={`${fin.ordersPaid} pedidos`} />
          <Card label="Taxa plataforma" value={brl(fin.platformFeeCents)} />
          <Card label="Reembolsos" value={brl(fin.refundsCents)} />
          <Card label="Gorjetas" value={brl(fin.tipsCents)} sub={`${fin.tipsCount} gorjetas`} />
          <Card label="Repasse estimado merchant" value={brl(fin.estimatedMerchantPayoutCents)} accent />
        </div>
      )}

      <h2 style={{ marginTop: 24 }}>Gorjetas por entregador</h2>
      <table className="table">
        <thead>
          <tr><th>Entregador</th><th>Gorjetas</th><th>Total</th></tr>
        </thead>
        <tbody>
          {tips.length === 0 ? (
            <tr><td colSpan={3} className="muted">Sem gorjetas no período.</td></tr>
          ) : (
            tips.map((t) => (
              <tr key={t.driverId}>
                <td>{t.driverName}</td>
                <td>{t.count}</td>
                <td>{brl(t.totalCents)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Card({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 16,
        background: accent ? "#fef2f2" : "#fff",
      }}
    >
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}
