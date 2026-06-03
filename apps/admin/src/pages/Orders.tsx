import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-context";

interface OrderRow {
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
interface OrdersResponse {
  items: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<string, number>;
}

const STATUSES = [
  "created",
  "paid",
  "preparing",
  "picking",
  "ready_for_pickup",
  "on_the_way",
  "delivered",
  "canceled",
];

const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;

export function Orders() {
  const { api } = useAuth();
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (status) q.set("status", status);
    void api.request<OrdersResponse>(`/admin/dashboard/orders?${q}`, { auth: true }).then(setData);
  }, [api, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1>Pedidos</h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <FilterChip label="Todos" active={status === ""} onClick={() => { setStatus(""); setPage(1); }} />
        {STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={`${s} (${data?.statusCounts[s] ?? 0})`}
            active={status === s}
            onClick={() => { setStatus(s); setPage(1); }}
          />
        ))}
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th>Lojas</th>
            <th>Status</th>
            <th>Pagamento</th>
            <th>Reembolso</th>
            <th>Total</th>
            <th>Criado</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((o) => (
            <tr key={o.id}>
              <td>#{o.id.slice(0, 6)}</td>
              <td>{o.customer}</td>
              <td>{o.stores.join(", ")}</td>
              <td><span className={`badge badge-${o.status}`}>{o.status}</span></td>
              <td className="muted">{o.paymentStatus ?? "—"}</td>
              <td>{o.refundCents > 0 ? brl(o.refundCents) : "—"}</td>
              <td>{brl(o.totalCents)}</td>
              <td className="muted">{new Date(o.createdAt).toLocaleString("pt-BR")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {data && data.total > data.pageSize && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← anterior
          </button>
          <span className="muted">
            página {data.page} de {Math.ceil(data.total / data.pageSize)}
          </span>
          <button
            className="btn-ghost"
            disabled={page >= Math.ceil(data.total / data.pageSize)}
            onClick={() => setPage((p) => p + 1)}
          >
            próxima →
          </button>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={active ? "nav-item active" : "nav-item"}
      style={{ padding: "4px 10px", borderRadius: 6, fontSize: 13, cursor: "pointer" }}
    >
      {label}
    </button>
  );
}
