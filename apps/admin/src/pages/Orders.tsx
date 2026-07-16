import { useState } from "react";
import { Link } from "react-router-dom";
import { useAdminOrders } from "@/api/hooks/useAdminOrders";
import { useDebouncedValue } from "@/lib/useDebounce";

/**
 * Pedidos do admin (story 67): migrado ao padrão React Query (legado
 * useState/useEffect migra ao ser tocado — CLAUDE.md), com busca do suporte
 * (id exato, nome ou e-mail do cliente, com debounce) e link para o detalhe
 * profundo (`orders/:id`).
 */

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
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim());

  const { data } = useAdminOrders({ status: status || undefined, q: q || undefined, page });

  return (
    <div>
      <h1>Pedidos</h1>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <input
          className="input"
          type="search"
          placeholder="Buscar por id do pedido, nome ou e-mail do cliente…"
          aria-label="Buscar pedidos"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{ minWidth: 320 }}
        />
      </div>

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
              <td>
                <Link to={`/orders/${o.id}`}>#{o.id.slice(0, 6)}</Link>
              </td>
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
      {data && data.items.length === 0 && <p className="muted">Nenhum pedido encontrado.</p>}

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
